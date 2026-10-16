import { NextRequest, NextResponse } from 'next/server';
import { parseOperationWithAIOrFallback, detectCommand } from '@/lib/agent-service';
import { generateDailySummaryMessage, undoLastOperationMessage } from '@/lib/operations-helper';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, imageBase64 } = body;

    if (!text && !imageBase64) {
      return NextResponse.json({ error: 'No input provided' }, { status: 400 });
    }

    // 1. Detectar si es un comando especial en texto (resumen o anular)
    if (text) {
      const cmd = detectCommand(text);
      if (cmd.isCommand) {
        if (cmd.command === 'resumen') {
          const summary = await generateDailySummaryMessage();
          return NextResponse.json(
            {
              success: true,
              isCommand: true,
              command: 'resumen',
              reply: summary,
              source: 'local',
            },
            { status: 200 }
          );
        }

        if (cmd.command === 'anular') {
          const undoResult = await undoLastOperationMessage();
          return NextResponse.json(
            {
              success: true,
              isCommand: true,
              command: 'anular',
              reply: undoResult.message,
              source: 'local',
            },
            { status: 200 }
          );
        }
      }
    }

    // 2. Procesar con IA o conmutar al fallback local robusto
    const result = await parseOperationWithAIOrFallback(text || '', imageBase64);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
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
