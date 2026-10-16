import { NextRequest, NextResponse } from 'next/server';
import { parseOperationWithAIOrFallback } from '@/lib/agent-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, imageBase64 } = body;

    if (!text && !imageBase64) {
      return NextResponse.json({ error: 'No input provided' }, { status: 400 });
    }

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
