import { NextRequest, NextResponse } from 'next/server';
import { parseLocalFallback } from '@/lib/local-parser';

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, imageBase64, audioBase64 } = body;

    if (!text && !imageBase64 && !audioBase64) {
      return NextResponse.json({ error: 'No input provided' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    // Try Gemini API first if key exists
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
          const parsed = JSON.parse(resultText);
          return NextResponse.json({ success: true, operation: parsed, source: 'gemini' });
        }
      } catch (geminiError) {
        // Fallback silencioso si la API key no es válida o hay error de red/cuota
        console.warn('Gemini API notice: usando local-parser como fallback.');
      }
    }

    // Fallback a local parser
    if (text) {
      try {
        const parsed = parseLocalFallback(text);
        if (parsed) {
          return NextResponse.json({ success: true, operation: parsed, source: 'local' });
        }
      } catch (parserErr) {
        console.warn('Local parser notice:', parserErr);
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: 'No pude entender la operación. Intentá con algo como: "Compré 500 dólares a 7750 por Ueno"',
      },
      { status: 200 }
    );
  } catch (error) {
    // Si incluso hay una excepción imprevista, intentar parsear el texto antes de devolver error
    console.warn('Agent API handled exception:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Ocurrió un detalle al procesar. Intentá con un mensaje como: "Compré 500 dólares a 7750 por Ueno"',
      },
      { status: 200 }
    );
  }
}
