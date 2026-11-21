import { AgentResponse } from '@/types';
import { parseLocalFallback, detectCommand } from './local-parser';

export { detectCommand };

const SYSTEM_PROMPT = `Eres el asistente inteligente de un cambista (operador cambiario y financiero) en Paraguay. Tu trabajo es interpretar mensajes de texto, comprobantes de pago/transferencias bancarias (imágenes) y notas de voz (audios) en español paraguayo, y extraer la información estructurada de la transacción o ejecutar comandos.

REGLAS DE NEGOCIO:
- Moneda base: Guaraníes (PYG)
- Divisas: USD (dólar), BRL (real brasileño), ARS (peso argentino), EUR (euro)
- COMPRA: el cambista compra moneda extranjera (entra divisa, sale PYG)
- VENTA: el cambista vende moneda extranjera (sale divisa, entra PYG)
- GASTO: gasto operativo, pago a proveedores o transferencias bancarias en guaraníes

COMANDOS ESPECIALES DEL SISTEMA:
- Si el usuario pide ayuda, explicaciones o qué cosas puede hacer (ej: "ayuda", "help", "¿qué comandos tenés?", "¿cómo funciona?", "menú"):
  marca isCommand=true y command="ayuda".
- Si el usuario consulta saldos de bancos o caja (ej: "saldos", "cuánto dinero tengo", "plata en el banco", "mis cuentas"):
  marca isCommand=true y command="saldos".
- Si el usuario consulta disponibilidad de divisas o billetes (ej: "stock", "cuántos dólares tengo", "billetes disponibles"):
  marca isCommand=true y command="stock".
- Si el usuario pide el resumen diario o balance del día (ej: "resumen", "cierre de caja", "cómo cerramos hoy"):
  marca isCommand=true y command="resumen".
- Si el usuario pide anular o deshacer la última operación (ej: "anular", "deshacer", "borrar último", "me equivoqué"):
  marca isCommand=true y command="anular".

COMPROBANTES DE PAGO Y TRANSFERENCIAS BANCARIAS (IMÁGENES):
- Si el usuario envía una imagen de un comprobante de transferencia (SIPAP, extracto, ticket o recibo):
  1. Identifica el banco o entidad emisora (ej. "Itaú", "Banco Familiar", "BNF", "Continental").
  2. Extrae el monto de la transferencia en Guaraníes (o divisa extranjera si el comprobante es en USD).
  3. En "description", anota el beneficiario o concepto del comprobante (ej: "Transferencia a Juan Pérez - Ref #49281").
  4. Si el comprobante muestra una transferencia realizada / débito / pago de servicio, clasifícalo como tipo "GASTO".
  5. Si el usuario acompañó la imagen con un texto (ej: "compré 200 dólares con esta transferencia"), respeta la intención del usuario ("COMPRA" de 200 USD).

NOTAS DE VOZ (AUDIOS):
- Si el usuario envía un audio o nota de voz:
  1. Escucha atentamente la dicción y modismos en español paraguayo.
  2. Transcribe el audio completo en el campo "transcription".
  3. Si el usuario solicita un comando (ayuda, saldos, stock, resumen, anular), marca isCommand=true y su command correspondiente.
  4. Si el usuario dicta una operación cambiaria o gasto (ej: "Compré 500 dólares a 7800 por Familiar"), extrae la operación normalmente con type, currency, amount, rate, totalPYG y account.

JERGA Y CUENTAS PARAGUAYAS:
- "palo" = 1.000.000 guaraníes
- "mil" o "lucas" = 1.000 guaraníes
- Cuentas válidas: "Efectivo PYG", "Itaú", "Banco Familiar", "BNF", "Continental"
- Si no menciona banco o cuenta, usar "Efectivo PYG"
- "en efectivo" o "cash" o "en mano" = "Efectivo PYG"

CÁLCULOS:
- totalPYG = amount * rate (para COMPRA y VENTA)
- Para GASTO, totalPYG es el monto de la transferencia o gasto

FORMATO DE RESPUESTA (JSON, sin texto adicional). Incluí SIEMPRE todos los campos que correspondan:
- Operación: {"isCommand": false, "type": "COMPRA"|"VENTA"|"GASTO", "currency": "USD"|"BRL"|"ARS"|"EUR" (no en GASTO), "amount": número (cantidad de divisa, no en GASTO), "rate": número (Gs. por unidad, no en GASTO), "totalPYG": número (OBLIGATORIO: monto total en guaraníes sin puntos), "account": cuenta válida, "description": texto (en GASTO: concepto o beneficiario), "transcription": texto (solo si hubo audio)}
- Comando: {"isCommand": true, "command": "ayuda"|"resumen"|"saldos"|"stock"|"anular", "transcription": texto (solo si hubo audio)}
- Los montos son números puros: "Gs. 2.350.000" → 2350000.`;

type GeminiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

/**
 * Modelos gratuitos en orden de preferencia (medidos en nov-2026 con la clave del proyecto):
 * - gemini-3.5-flash-lite: ~1 s en texto e imágenes, lee comprobantes correctamente.
 * - gemini-3.1-flash-lite: ~1,3 s, mismo nivel de precisión. Respaldo con cuota separada.
 * - gemini-3-flash-preview: ~2,5 s, modelo "flash" completo para casos difíciles.
 * gemini-3.5-flash (el que se usaba para imágenes/audio) tardaba 4–16 s y provocaba timeouts.
 * Se puede sobrescribir con GEMINI_MODELS="modelo1,modelo2".
 */
const DEFAULT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3-flash-preview'];

function getModelChain(): string[] {
  const custom = (process.env.GEMINI_MODELS || '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return custom.length > 0 ? custom : DEFAULT_MODELS;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Llama a Gemini probando cada modelo de la cadena. Si uno devuelve error (429 por límite
 * del plan gratuito, 503 por saturación), tarda demasiado o responde JSON inválido,
 * pasa al siguiente. Todo dentro de un presupuesto de tiempo para no superar el límite de Vercel.
 */
async function generateWithFallback(
  apiKey: string,
  parts: GeminiPart[],
  hasMedia: boolean
): Promise<AgentResponse | null> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });

  const perAttemptMs = hasMedia ? 20000 : 10000;
  const budgetMs = hasMedia ? 45000 : 25000;
  const started = Date.now();
  const models = getModelChain();

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const remaining = budgetMs - (Date.now() - started);
    if (remaining < 2000) break;

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout ${model}`)), Math.min(perAttemptMs, remaining));
      });
      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          // Sin responseSchema estricto: con esquema los modelos lite omitían el monto de los
          // comprobantes. El formato va explícito en el prompt y se valida después.
          config: { responseMimeType: 'application/json', temperature: 0 },
        }),
        timeout,
      ]);
      const text = response.text;
      if (!text) throw new Error('respuesta vacía');
      const parsed = JSON.parse(text) as AgentResponse;
      if (i > 0) console.log(`✅ [GEMINI] Respondió el modelo de respaldo ${model}`);
      return parsed;
    } catch (err: any) {
      const status = err?.status || err?.code || '';
      console.warn(`⚠️ [GEMINI] ${model} falló (${status} ${String(err?.message || err).slice(0, 120)})`);
      // Pequeña espera ante saturación/límite antes de probar el siguiente modelo
      if (String(status).startsWith('5') || status === 429) await sleep(400);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  console.error('❌ [GEMINI] Ningún modelo respondió a tiempo');
  return null;
}

export interface MediaInput {
  imageBase64?: string;
  imageMimeType?: string;
  audioBase64?: string;
  audioMimeType?: string;
}

/**
 * Interpreta una operación en lenguaje natural, comprobante de pago (imagen) o nota de voz (audio)
 * usando Gemini con salida estructurada, con respaldo inteligente local.
 */
export async function parseOperationWithAIOrFallback(
  text?: string,
  media?: MediaInput | string
): Promise<{
  success: boolean;
  operation?: AgentResponse;
  source: 'gemini' | 'local';
  isCommand?: boolean;
  command?: string;
  transcription?: string;
  error?: string;
}> {
  const cleanText = (text || '').trim();

  // 1. Verificar primero si es un comando especial en texto directo (resumen, anular)
  if (cleanText) {
    const cmd = detectCommand(cleanText);
    if (cmd.isCommand) {
      return {
        success: true,
        source: 'local',
        isCommand: true,
        command: cmd.command,
        operation: {
          type: 'COMPRA',
          isCommand: true,
          command: cmd.command,
        },
      };
    }
  }

  // Normalizar media input
  const mediaObj: MediaInput =
    typeof media === 'string'
      ? { imageBase64: media, imageMimeType: 'image/jpeg' }
      : media || {};

  const apiKey = process.env.GEMINI_API_KEY;

  // 2. Procesamiento con Gemini (texto, comprobantes y audios) con modelos de respaldo
  if (apiKey && (cleanText || mediaObj.imageBase64 || mediaObj.audioBase64)) {
    const parts: GeminiPart[] = [];
    let userPrompt = SYSTEM_PROMPT;
    const hasMedia = !!(mediaObj.audioBase64 || mediaObj.imageBase64);

    if (mediaObj.audioBase64) {
      userPrompt += cleanText
        ? `\n\nNota de voz del usuario con texto adjunto: "${cleanText}". Escucha el audio, transcríbelo en "transcription" y extrae la operación:`
        : '\n\nNota de voz del usuario. Escucha atentamente el audio, transcríbelo en "transcription" y extrae la operación cambiaria o comando:';
      parts.push({ text: userPrompt });
      parts.push({ inlineData: { mimeType: mediaObj.audioMimeType || 'audio/ogg', data: mediaObj.audioBase64 } });
    } else if (mediaObj.imageBase64) {
      userPrompt += cleanText
        ? `\n\nComprobante de pago o transferencia bancaria enviado por el usuario con mensaje: "${cleanText}". Analiza los datos del comprobante y extrae la operación:`
        : '\n\nComprobante de pago o transferencia bancaria enviado por el usuario. Analiza el comprobante (banco, monto, destinatario/concepto) y extrae la operación:';
      parts.push({ text: userPrompt });
      parts.push({ inlineData: { mimeType: mediaObj.imageMimeType || 'image/jpeg', data: mediaObj.imageBase64 } });
    } else {
      userPrompt += `\n\nMensaje del cambista: "${cleanText}"`;
      parts.push({ text: userPrompt });
    }

    const parsed = await generateWithFallback(apiKey, parts, hasMedia);
    if (parsed) {
      if (parsed.isCommand && parsed.command) {
        return {
          success: true,
          source: 'gemini',
          isCommand: true,
          command: parsed.command,
          transcription: parsed.transcription,
          operation: parsed,
        };
      }
      // La cuenta puede faltar (no se mencionó banco): se usa Efectivo PYG al validar.
      if (parsed.type) {
        return { success: true, operation: parsed, source: 'gemini', transcription: parsed.transcription };
      }
    }
  }


  // 3. Parser local de respaldo si hay texto disponible
  if (cleanText) {
    try {
      const parsed = parseLocalFallback(cleanText);
      if (parsed) {
        return {
          success: true,
          operation: parsed,
          source: 'local',
          isCommand: parsed.isCommand,
          command: parsed.command,
        };
      }
    } catch (parserErr) {
      console.warn('Local parser warning:', parserErr);
    }
  }

  return {
    success: false,
    source: 'local',
    error: 'No pude interpretar la operación o comprobante. Podés escribir por ejemplo: "Compré 500 dólares a 7750 por Itaú", mandar una foto del comprobante o dictar una nota de voz.',
  };
}
