import { supabaseAdmin } from '@/lib/supabase';
import { Account, AgentResponse, BANK_ACCOUNTS, CURRENCIES, Currency, Operation, OperationType } from '@/types';

/**
 * Registro, corrección y anulación de operaciones.
 * Toda la lógica de saldos/stock/PPP vive en funciones de Postgres
 * (supabase-migration-002.sql) que corren en una sola transacción y en fila:
 * dos mensajes simultáneos no pueden descuadrar los saldos.
 * La usan el webhook de WhatsApp, el chat web y la pantalla de movimientos.
 */

/** Cuentas en guaraníes válidas para pagar/cobrar una operación. */
export const PYG_ACCOUNTS: Account[] = ['Efectivo PYG', ...BANK_ACCOUNTS];

function asPYGAccount(account?: string | null): Account | null {
  return account && (PYG_ACCOUNTS as string[]).includes(account) ? (account as Account) : null;
}

export function normalizePYGAccount(account?: string | null): Account {
  // Gemini a veces devuelve "Efectivo USD" para una compra: el pago en Gs. sale del efectivo PYG
  return asPYGAccount(account) || 'Efectivo PYG';
}

export interface ValidatedOperation {
  type: OperationType;
  currency?: Currency;
  amount?: number;
  rate?: number;
  totalPYG: number;
  account: Account;
  toAccount?: Account;
  description?: string;
}

export interface OperationMeta {
  registeredBy?: string;
  source?: 'whatsapp' | 'web';
}

/** Valida lo que interpretó la IA (o lo que se editó en la web). */
export function validateParsedOperation(
  parsed: AgentResponse
): { ok: true; op: ValidatedOperation } | { ok: false; reason: string } {
  const account = normalizePYGAccount(parsed.account);
  const total = Math.round(Number(parsed.totalPYG) || 0);
  const description = parsed.description?.trim() || undefined;

  if (parsed.type === 'GASTO' || parsed.type === 'INGRESO') {
    if (total <= 0) {
      return { ok: false, reason: parsed.type === 'GASTO' ? 'No encontré el monto del gasto.' : 'No encontré el monto que entró.' };
    }
    return { ok: true, op: { type: parsed.type, totalPYG: total, account, description } };
  }

  if (parsed.type === 'TRANSFERENCIA') {
    const from = asPYGAccount(parsed.account);
    const to = asPYGAccount(parsed.toAccount);
    if (total <= 0) return { ok: false, reason: 'No encontré el monto de la transferencia.' };
    if (!from || !to) return { ok: false, reason: 'No identifiqué de qué cuenta a qué cuenta se pasó la plata.' };
    if (from === to) return { ok: false, reason: 'La cuenta de origen y de destino son la misma.' };
    return { ok: true, op: { type: 'TRANSFERENCIA', totalPYG: total, account: from, toAccount: to, description } };
  }

  if (parsed.type === 'COMPRA' || parsed.type === 'VENTA') {
    const currency = parsed.currency;
    const amount = Number(parsed.amount) || 0;
    const rate = Number(parsed.rate) || 0;
    if (!currency || !CURRENCIES.includes(currency)) {
      return { ok: false, reason: 'No identifiqué la moneda (dólar, real, peso o euro).' };
    }
    if (amount <= 0) return { ok: false, reason: 'No identifiqué la cantidad.' };
    if (rate <= 0) return { ok: false, reason: 'No identifiqué la cotización (ej: "a 7750").' };
    return {
      ok: true,
      op: { type: parsed.type, currency, amount, rate, totalPYG: Math.round(amount * rate), account, description },
    };
  }

  return { ok: false, reason: 'No identifiqué si es compra, venta, gasto, ingreso o transferencia.' };
}

function toPayload(op: ValidatedOperation, meta: OperationMeta = {}) {
  return {
    type: op.type,
    currency: op.currency ?? null,
    amount: op.amount ?? null,
    rate: op.rate ?? null,
    totalPYG: op.totalPYG,
    account: op.account,
    toAccount: op.toAccount ?? null,
    description: op.description ?? null,
    registeredBy: meta.registeredBy ?? null,
    source: meta.source ?? null,
  };
}

/** Convierte una fila de `transactions` al tipo Operation. */
export function rowToOperation(row: any): Operation {
  return {
    id: row.id,
    operationNumber: Number(row.operation_number),
    timestamp: row.timestamp,
    type: row.type,
    currency: row.currency || undefined,
    amount: row.amount !== null && row.amount !== undefined ? Number(row.amount) : undefined,
    rate: row.rate !== null && row.rate !== undefined ? Number(row.rate) : undefined,
    totalPYG: Number(row.total_pyg) || 0,
    account: row.account,
    toAccount: row.to_account || undefined,
    profit: row.profit !== null && row.profit !== undefined ? Number(row.profit) : undefined,
    description: row.description || undefined,
    registeredBy: row.registered_by || undefined,
    source: row.source || undefined,
  };
}

export interface RecordResult {
  operation: Operation;
  /** Advertencias para el usuario (ej. vendió más de lo que tenía en stock). */
  warnings: string[];
}

function resultToOperation(op: ValidatedOperation, meta: OperationMeta, r: any): RecordResult {
  return {
    operation: {
      id: r.id,
      operationNumber: Number(r.operation_number),
      timestamp: r.timestamp,
      type: op.type,
      currency: op.currency,
      amount: op.amount,
      rate: op.rate,
      totalPYG: op.totalPYG,
      account: op.account,
      toAccount: op.toAccount,
      profit: r.profit !== null && r.profit !== undefined ? Number(r.profit) : undefined,
      description: op.description,
      registeredBy: meta.registeredBy,
      source: meta.source,
    },
    warnings: Array.isArray(r.warnings) ? r.warnings : [],
  };
}

/** Registra una operación (atómico). */
export async function recordOperation(op: ValidatedOperation, meta: OperationMeta = {}): Promise<RecordResult> {
  const { data, error } = await supabaseAdmin.rpc('record_operation', { p: toPayload(op, meta) });
  if (error || !data) throw new Error(`No se pudo guardar la operación: ${error?.message || 'sin respuesta'}`);
  return resultToOperation(op, meta, data);
}

/** Corrige una operación existente (revierte la original y aplica la nueva). */
export async function updateOperationById(id: string, op: ValidatedOperation): Promise<RecordResult | null> {
  const { data, error } = await supabaseAdmin.rpc('update_operation', { p_id: id, p: toPayload(op) });
  if (error) throw new Error(`No se pudo corregir la operación: ${error.message}`);
  if (!data) return null;
  return resultToOperation(op, {}, data);
}

/** Elimina una operación y revierte su efecto en cuentas y stock. */
export async function deleteOperationById(id: string): Promise<Operation | null> {
  const { data, error } = await supabaseAdmin.rpc('delete_operation', { p_id: id });
  if (error) throw new Error(`No se pudo eliminar la operación: ${error.message}`);
  return data ? rowToOperation(data) : null;
}

/** Elimina la última operación registrada (comando "anular"). */
export async function deleteLastOperation(): Promise<Operation | null> {
  const { data, error } = await supabaseAdmin.rpc('delete_last_operation');
  if (error) throw new Error(`No se pudo anular: ${error.message}`);
  return data ? rowToOperation(data) : null;
}
