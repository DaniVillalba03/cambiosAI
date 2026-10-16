import { AgentResponse } from '@/types';
import { parseLocalFallback } from './local-parser';

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
 * o conmuta de forma silenciosa y automática al parser local de respaldo.
 */
export async function parseOperationWithAIOrFallback(
  text: string,
  imageBase64?: string
): Promise<{
  success: boolean;
  operation?: AgentResponse;
  source: 'gemini' | 'local';
  error?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;

  // 1. Intentar con Gemini 2.5 Flash si hay API Key configurada
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

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_SCHEMA,
        },
      });

      const resultText = response.text;
      if (resultText) {
        const parsed = JSON.parse(resultText) as AgentResponse;
        if (parsed.type && parsed.account) {
          return { success: true, operation: parsed, source: 'gemini' };
        }
      }
    } catch {
      // Conmutar silenciosamente al parser local
    }
  }

  // 2. Parser local inteligente de respaldo
  if (text) {
    try {
      const parsed = parseLocalFallback(text);
      if (parsed) {
        return { success: true, operation: parsed, source: 'local' };
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
