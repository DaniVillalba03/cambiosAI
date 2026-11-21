import { NextRequest, NextResponse } from 'next/server';
import { parseOperationWithAIOrFallback, detectCommand } from '@/lib/agent-service';
import { runCommand, formatOperationConfirmation } from '@/lib/operations-helper';
import { recordOperation, validateParsedOperation } from '@/lib/operations-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Chat web: interpreta el mensaje y, si es una operación, la registra en Supabase
 * con la misma lógica que el bot de WhatsApp. La web se actualiza por Realtime.
 */
export async function POST(request: NextRequest) {
  try {
    const { text, imageBase64, imageMimeType } = await request.json();

    if (!text && !imageBase64) {
      return NextResponse.json({ success: false, error: 'Mensaje vacío' }, { status: 400 });
    }

    if (text && !imageBase64) {
      const cmd = detectCommand(text);
      if (cmd.isCommand && cmd.command) {
        return NextResponse.json({ success: true, isCommand: true, reply: await runCommand(cmd.command) });
      }
    }

    const result = await parseOperationWithAIOrFallback(text || '', {
      imageBase64: imageBase64 || undefined,
      imageMimeType: imageMimeType || 'image/jpeg',
    });

    if (result.isCommand && result.command) {
      return NextResponse.json({ success: true, isCommand: true, reply: await runCommand(result.command) });
    }

    if (!result.success || !result.operation) {
      return NextResponse.json({
        success: false,
        error:
          result.error ||
          'No entendí la operación. Probá con: "Compré 500 dólares a 7750 por Itaú".',
      });
    }

    const validation = validateParsedOperation(result.operation);
    if (!validation.ok) {
      return NextResponse.json({
        success: false,
        error: `${validation.reason} No registré nada.`,
      });
    }

    const { operation, warnings } = await recordOperation(validation.op);
    return NextResponse.json({
      success: true,
      operation,
      source: result.source,
      reply: formatOperationConfirmation(operation, { warnings, isReceipt: !!imageBase64 }),
    });
  } catch (error: any) {
    console.error('Agent API error:', error);
    return NextResponse.json({
      success: false,
      error: `No se pudo guardar: ${error?.message || 'error desconocido'}. Revisá la conexión con Supabase.`,
    });
  }
}
