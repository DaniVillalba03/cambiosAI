import { AgentResponse } from '@/types';
import { parseLocalFallback, detectCommand } from './local-parser';

export { detectCommand };

const GEMINI_SCHEMA = {
  type: 'object' as const,
  properties: {
    isCommand: {
      type: 'boolean' as const,
      description: 'true si el usuario solicita un comando como ayuda, resumen, saldos, stock o anular',
    },
    command: {
      type: 'string' as const,
      enum: ['ayuda', 'resumen', 'saldos', 'stock', 'anular'],
      description: 'Comando solicitado por el usuario',
    },
    transcription: {
      type: 'string' as const,
      description: 'Transcripción fiel del audio si se envió una nota de voz',
    },
    type: {
      type: 'string' as const,
      enum: ['COMPRA', 'VENTA', 'GASTO'],
      description: 'Tipo de operación (no aplica para comandos)',
    },
    currency: {
      type: 'string' as const,
      enum: ['USD', 'BRL', 'ARS', 'EUR'],
      description: 'Moneda extranjera (no aplica para GASTO ni comandos)',
    },
    amount: {
      type: 'number' as const,
      description: 'Cantidad de moneda extranjera (no aplica para GASTO ni comandos)',
    },
    rate: {
      type: 'number' as const,
      description: 'Cotización en Guaraníes por 1 unidad de moneda extranjera',
    },
    totalPYG: {
      type: 'number' as const,
      description: 'Total en Guaraníes (amount * rate, o monto del gasto)',
    },
    account: {
      type: 'string' as const,
      enum: [
        'Efectivo PYG',
        'Efectivo USD',
        'Efectivo BRL',
        'Efectivo ARS',
        'Efectivo EUR',
        'Ueno Bank',
        'Itaú',
        'Banco Familiar',
        'BNF',
        'Continental',
      ],
      description: 'Cuenta PYG utilizada para la operación',
    },
    description: {
      type: 'string' as const,
      description: 'Descripción del gasto (solo para GASTO)',
    },
  },
};

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
  1. Identifica el banco o entidad emisora (ej. "Ueno Bank", "Itaú", "Banco Familiar", "BNF", "Continental").
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
- Cuentas válidas: "Efectivo PYG", "Ueno Bank", "Itaú", "Banco Familiar", "BNF", "Continental"
- Si no menciona banco o cuenta, usar "Efectivo PYG"
- "en efectivo" o "cash" o "en mano" = "Efectivo PYG"

CÁLCULOS:
- totalPYG = amount * rate (para COMPRA y VENTA)
- Para GASTO, totalPYG es el monto de la transferencia o gasto

Siempre responde SOLO con el JSON estructurado. No agregues texto adicional.`;

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

  // 2. Procesamiento con Gemini Multimodal
  if (apiKey && (cleanText || mediaObj.imageBase64 || mediaObj.audioBase64)) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      let userPrompt = SYSTEM_PROMPT;
      let model = 'gemini-3.5-flash-lite';
      let timeoutMs = 4000;

      if (mediaObj.audioBase64) {
        model = 'gemini-3.5-flash';
        timeoutMs = 9000;
        userPrompt += cleanText
          ? `\n\nNota de voz del usuario con texto adjunto: "${cleanText}". Escucha el audio, transcríbelo en "transcription" y extrae la operación:`
          : '\n\nNota de voz del usuario. Escucha atentamente el audio, transcríbelo en "transcription" y extrae la operación cambiaria o comando:';
        parts.push({ text: userPrompt });
        parts.push({
          inlineData: {
            mimeType: mediaObj.audioMimeType || 'audio/ogg',
            data: mediaObj.audioBase64,
          },
        });
      } else if (mediaObj.imageBase64) {
        model = 'gemini-3.5-flash';
        timeoutMs = 9000;
        userPrompt += cleanText
          ? `\n\nComprobante de pago o transferencia bancaria enviado por el usuario con mensaje: "${cleanText}". Analiza los datos del comprobante y extrae la operación:`
          : '\n\nComprobante de pago o transferencia bancaria enviado por el usuario. Analiza el comprobante (banco, monto, destinatario/concepto) y extrae la operación:';
        parts.push({ text: userPrompt });
        parts.push({
          inlineData: {
            mimeType: mediaObj.imageMimeType || 'image/jpeg',
            data: mediaObj.imageBase64,
          },
        });
      } else {
        userPrompt += `\n\nMensaje del cambista: "${cleanText}"`;
        parts.push({ text: userPrompt });
      }

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout')), timeoutMs)
      );

      const response = await Promise.race([
        ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: GEMINI_SCHEMA,
          },
        }),
        timeoutPromise,
      ]);

      const resultText = response.text;
      if (resultText) {
        const parsed = JSON.parse(resultText) as AgentResponse;

        // Si en el audio o comprobante se detectó un comando
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

        if (parsed.type && parsed.account) {
          return {
            success: true,
            operation: parsed,
            source: 'gemini',
            transcription: parsed.transcription,
          };
        }
      }
    } catch (aiErr) {
      console.warn('⚠️ Gemini multimodal warning, evaluando fallback:', aiErr);
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
    error: 'No pude interpretar la operación o comprobante. Podés escribir por ejemplo: "Compré 500 dólares a 7750 por Ueno", mandar una foto del comprobante o dictar una nota de voz.',
  };
}
