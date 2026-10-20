import { NextRequest, NextResponse } from 'next/server';
import { parseOperationWithAIOrFallback, detectCommand } from '@/lib/agent-service';
import {
  generateDailySummaryMessage,
  undoLastOperationMessage,
  generateHelpMessage,
  generateBalancesMessage,
  generateStocksMessage,
} from '@/lib/operations-helper';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, imageBase64 } = body;

    if (!text && !imageBase64) {
      return NextResponse.json({ error: 'No input provided' }, { status: 400 });
    }

    // 1. Detectar si es un comando especial en texto directo
    if (text) {
      const cmd = detectCommand(text);
      if (cmd.isCommand) {
        if (cmd.command === 'ayuda') {
          const reply = generateHelpMessage();
          return NextResponse.json({ success: true, isCommand: true, command: 'ayuda', reply, source: 'local' });
        }
        if (cmd.command === 'saldos') {
          const reply = await generateBalancesMessage();
          return NextResponse.json({ success: true, isCommand: true, command: 'saldos', reply, source: 'local' });
        }
        if (cmd.command === 'stock') {
          const reply = await generateStocksMessage();
          return NextResponse.json({ success: true, isCommand: true, command: 'stock', reply, source: 'local' });
        }
        if (cmd.command === 'resumen') {
          const summary = await generateDailySummaryMessage();
          return NextResponse.json({ success: true, isCommand: true, command: 'resumen', reply: summary, source: 'local' });
        }
        if (cmd.command === 'anular') {
          const undoResult = await undoLastOperationMessage();
          return NextResponse.json({ success: true, isCommand: true, command: 'anular', reply: undoResult.message, source: 'local' });
        }
      }
    }

    // 2. Procesar con IA o conmutar al fallback local robusto
    const result = await parseOperationWithAIOrFallback(text || '', imageBase64);

    // Si Gemini o el fallback detectó un comando en audio o texto
    if (result.isCommand && result.command) {
      let reply = '';
      if (result.command === 'ayuda') {
        reply = generateHelpMessage();
      } else if (result.command === 'saldos') {
        reply = await generateBalancesMessage();
      } else if (result.command === 'stock') {
        reply = await generateStocksMessage();
      } else if (result.command === 'resumen') {
        reply = await generateDailySummaryMessage();
      } else if (result.command === 'anular') {
        const undoResult = await undoLastOperationMessage();
        reply = undoResult.message;
      }

      return NextResponse.json({
        success: true,
        isCommand: true,
        command: result.command,
        reply,
        transcription: result.transcription,
        source: result.source,
      });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.warn('Agent API handled exception:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Ocurrió un detalle al procesar. Podés escribir "ayuda" para ver todos los comandos disponibles o dictar: "Compré 500 dólares a 7750 por Ueno"',
      },
      { status: 200 }
    );
  }
}

