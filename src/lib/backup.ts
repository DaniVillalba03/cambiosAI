import { supabaseAdmin } from '@/lib/supabase';

const BUCKET = 'backups';
const KEEP = 8; // semanas de copias a conservar

/** Junta todas las tablas en un solo objeto JSON. */
export async function buildBackup() {
  const [accounts, stocks, transactions] = await Promise.all([
    supabaseAdmin.from('accounts').select('*'),
    supabaseAdmin.from('currency_stocks').select('*'),
    supabaseAdmin.from('transactions').select('*').order('operation_number', { ascending: true }),
  ]);
  const err = accounts.error || stocks.error || transactions.error;
  if (err) throw new Error(`No se pudo leer la base: ${err.message}`);
  return {
    app: 'MiCambio',
    version: 1,
    created_at: new Date().toISOString(),
    accounts: accounts.data,
    currency_stocks: stocks.data,
    transactions: transactions.data,
  };
}

/** Guarda una copia en el bucket privado `backups` y borra las más viejas. */
export async function saveBackupToStorage(): Promise<string> {
  const backup = await buildBackup();
  const name = `micambio-${backup.created_at.slice(0, 10)}.json`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(name, JSON.stringify(backup), { contentType: 'application/json', upsert: true });
  if (error) throw new Error(`No se pudo guardar la copia: ${error.message}`);

  const { data: files } = await supabaseAdmin.storage.from(BUCKET).list('', { limit: 100 });
  const old = (files || [])
    .map((f) => f.name)
    .filter((n) => n.startsWith('micambio-'))
    .sort()
    .reverse()
    .slice(KEEP);
  if (old.length) await supabaseAdmin.storage.from(BUCKET).remove(old);
  return name;
}
