import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { saveBackupToStorage } from '@/lib/backup';
import { PY_TIMEZONE } from '@/lib/time';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Tarea diaria (Vercel Cron, ver vercel.json):
 * 1. Consulta la base para que Supabase no se pause por inactividad (plan gratuito: 7 días).
 * 2. Los domingos (hora de Paraguay) guarda una copia de seguridad completa.
 * Si CRON_SECRET está configurado en Vercel, solo Vercel puede llamarla.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { count, error } = await supabaseAdmin.from('transactions').select('id', { count: 'exact', head: true });
  if (error) {
    console.error('❌ [CRON] Supabase no respondió:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // Limpieza: comprobantes pendientes viejos y mensajes procesados de más de 7 días
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  await supabaseAdmin.from('processed_messages').delete().lt('created_at', weekAgo);
  await supabaseAdmin.from('pending_operations').delete().lt('created_at', weekAgo);

  const weekday = new Date().toLocaleDateString('en-US', { timeZone: PY_TIMEZONE, weekday: 'short' });
  const force = request.nextUrl.searchParams.get('backup') === '1';
  let backup: string | null = null;
  if (weekday === 'Sun' || force) {
    try {
      backup = await saveBackupToStorage();
    } catch (e: any) {
      console.error('❌ [CRON] Falló la copia de seguridad:', e?.message);
      return NextResponse.json({ ok: false, transactions: count, error: e?.message }, { status: 500 });
    }
  }

  console.log(`✅ [CRON] Supabase activo (${count} operaciones)${backup ? `, copia ${backup}` : ''}`);
  return NextResponse.json({ ok: true, transactions: count, backup });
}
