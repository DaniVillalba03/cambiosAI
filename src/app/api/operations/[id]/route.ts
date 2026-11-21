import { NextRequest, NextResponse } from 'next/server';
import { deleteOperationById, updateOperationById, validateParsedOperation } from '@/lib/operations-server';
import { AgentResponse } from '@/types';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Elimina una operación y revierte saldos/stock (misma lógica que "anular" en WhatsApp). */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    const op = await deleteOperationById(id);
    if (!op) return NextResponse.json({ success: false, error: 'Operación no encontrada' }, { status: 404 });
    return NextResponse.json({ success: true, operation: op });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Error eliminando' }, { status: 500 });
  }
}

/** Corrige una operación: revierte la original y aplica los datos nuevos, en una sola transacción. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  try {
    const body = (await request.json()) as AgentResponse;
    const validation = validateParsedOperation(body);
    if (!validation.ok) return NextResponse.json({ success: false, error: validation.reason }, { status: 400 });

    const result = await updateOperationById(id, validation.op);
    if (!result) return NextResponse.json({ success: false, error: 'Operación no encontrada' }, { status: 404 });
    return NextResponse.json({ success: true, operation: result.operation, warnings: result.warnings });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Error corrigiendo' }, { status: 500 });
  }
}
