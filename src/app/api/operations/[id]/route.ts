import { NextRequest, NextResponse } from 'next/server';
import { deleteOperationById } from '@/lib/operations-server';

export const dynamic = 'force-dynamic';

/** Elimina una operación y revierte saldos/stock (misma lógica que "anular" en WhatsApp). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const op = await deleteOperationById(id);
    if (!op) return NextResponse.json({ success: false, error: 'Operación no encontrada' }, { status: 404 });
    return NextResponse.json({ success: true, operation: op });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Error eliminando' }, { status: 500 });
  }
}
