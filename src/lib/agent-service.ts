import { AgentResponse } from '@/types';
import { parseLocalFallback, detectCommand } from './local-parser';

export { detectCommand };

const GEMINI_SCHEMA = {
  type: 'object' as const,
  properties: {
    type: {
      type: 'string' as const,
      enum: ['COMPRA', 'VENTA', 'GASTO'],
      description: 'Tipo de operación',
    },
    currency: {
      type: 'string' as const,
      enum: ['USD', 'BRL', 'ARS', 'EUR'],
      description: 'Moneda extranjera (no aplica para GASTO)',
    },
    amount: {
      type: 'number' as const,
      description: 'Cantidad de moneda extranjera (no aplica para GASTO)',
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
  required: ['type', 'account', 'totalPYG'],
};

const SYSTEM_PROMPT = `Eres el asistente de un cambista (operador cambiario) en Paraguay. Tu trabajo es interpretar mensajes en español paraguayo sobre operaciones de cambio de divisas y extraer la información estructurada.

REGLAS DE NEGOCIO:
- Moneda base: Guaraníes (PYG)
- Divisas: USD (dólar), BRL (real brasileño), ARS (peso argentino), EUR (euro)
- COMPRA: el cambista compra moneda extranjera (entra divisa, sale PYG)
- VENTA: el cambista vende moneda extranjera (sale divisa, entra PYG)
- GASTO: gasto personal u operativo en guaraníes

JERGA PARAGUAYA:
- "palo" = 1.000.000 guaraníes
- "mil" o "lucas" = 1.000 guaraníes
- "Ueno" = Ueno Bank
- "Itaú" = Itaú
- "Familiar" = Banco Familiar
- "BNF" = BNF (Banco Nacional de Fomento)
- "Continental" = Continental
- Si no menciona cuenta, usar "Efectivo PYG"
- "en efectivo" o "cash" o "en mano" = "Efectivo PYG"

CÁLCULOS:
- totalPYG = amount * rate (para COMPRA y VENTA)
- Para GASTO, totalPYG es el monto del gasto

Siempre responde SOLO con el JSON estructurado. No agregues texto adicional.`;

/**
 * Interpreta una operación en lenguaje natural usando Gemini 2.5 Flash con salida estructurada,
 * o conmuta inmediatamente al parser local robusto si Gemini demora más de 3.5s o falla.
 */
export async function parseOperationWithAIOrFallback(
  text: string,
  imageBase64?: string
): Promise<{
  success: boolean;
  operation?: AgentResponse;
  source: 'gemini' | 'local';
  isCommand?: boolean;
  command?: string;
  error?: string;
}> {
  // 1. Verificar primero si es un comando especial (resumen, anular)
  if (text) {
    const cmd = detectCommand(text);
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

  const apiKey = process.env.GEMINI_API_KEY;

  // 2. Intentar con Gemini 2.5 Flash con un límite estricto de tiempo (3.5 segundos)
  if (apiKey && text) {
    try {
      const { GoogleGenAI } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey });

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
        { text: `${SYSTEM_PROMPT}\n\nMensaje del cambista: "${text}"` },
      ];

      if (imageBase64) {
        parts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBase64,
          },
        });
      }

      // Timeout de 3500ms para no demorar al usuario ni a la API de WhatsApp
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini timeout')), 3500)
      );

      const response = await Promise.race([
        ai.models.generateContent({
          model: 'gemini-3.5-flash-lite',
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
        if (parsed.type && parsed.account) {
          return { success: true, operation: parsed, source: 'gemini' };
        }
      }
    } catch {
      // Conmutar instantáneamente al parser local
    }
  }

  // 3. Parser local inteligente e infalible de respaldo
  if (text) {
    try {
      const parsed = parseLocalFallback(text);
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
    error: 'No pude entender la operación. Intentá con algo como: "Compré 500 dólares a 7750 por Ueno"',
  };
}
