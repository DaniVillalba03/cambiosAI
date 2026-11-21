import { NextResponse } from 'next/server';
import { buildBackup } from '@/lib/backup';
import { dateKeyPY } from '@/lib/time';

export const dynamic = 'force-dynamic';

/** Descarga una copia completa de los datos (botón en Informes). */
export async function GET() {
  try {
    const backup = await buildBackup();
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="micambio-copia-${dateKeyPY()}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'No se pudo generar la copia' }, { status: 500 });
  }
}
