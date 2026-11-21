import { supabaseAdmin } from '@/lib/supabase';
import { generateId } from '@/lib/utils';
import {
  Account,
  AgentResponse,
  BANK_ACCOUNTS,
  CURRENCIES,
  Currency,
  Operation,
  OperationType,
} from '@/types';

/**
 * Lógica ÚNICA de registro/anulación de operaciones.
 * La usan el webhook de WhatsApp, el chat web (/api/agent) y el botón
 * de eliminar del dashboard, para que todos calculen saldos, stock y PPP
 * exactamente igual y compartan la misma numeración.
 */

/** Cuentas en guaraníes válidas para pagar/cobrar una operación. */
const PYG_ACCOUNTS: Account[] = ['Efectivo PYG', ...BANK_ACCOUNTS];

export function normalizePYGAccount(account?: string | null): Account {
  if (account && (PYG_ACCOUNTS as string[]).includes(account)) return account as Account;
  // Gemini a veces devuelve "Efectivo USD" para una compra: el pago en Gs. sale del efectivo PYG
  return 'Efectivo PYG';
}

export interface ValidatedOperation {
  type: OperationType;
  currency?: Currency;
  amount?: number;
  rate?: number;
  totalPYG: number;
  account: Account;
  description?: string;
}

/** Valida lo que interpretó la IA. Devuelve un mensaje de error legible si falta algo. */
export function validateParsedOperation(
  parsed: AgentResponse
): { ok: true; op: ValidatedOperation } | { ok: false; reason: string } {
  const account = normalizePYGAccount(parsed.account);

  if (parsed.type === 'GASTO') {
    const total = Math.round(Number(parsed.totalPYG) || 0);
    if (total <= 0) return { ok: false, reason: 'No encontré el monto del gasto.' };
    return {
      ok: true,
      op: { type: 'GASTO', totalPYG: total, account, description: parsed.description || undefined },
    };
  }

  if (parsed.type === 'COMPRA' || parsed.type === 'VENTA') {
    const currency = parsed.currency;
    const amount = Number(parsed.amount) || 0;
    const rate = Number(parsed.rate) || 0;
    if (!currency || !CURRENCIES.includes(currency)) {
      return { ok: false, reason: 'No identifiqué la divisa (USD, BRL, ARS o EUR).' };
    }
    if (amount <= 0) return { ok: false, reason: 'No identifiqué la cantidad de divisa.' };
    if (rate <= 0) return { ok: false, reason: 'No identifiqué la cotización (ej: "a 7750").' };
    return {
      ok: true,
      op: {
        type: parsed.type,
        currency,
        amount,
        rate,
        totalPYG: Math.round(amount * rate),
        account,
        description: parsed.description || undefined,
      },
    };
  }

  return { ok: false, reason: 'No identifiqué si es compra, venta o gasto.' };
}

async function getAccountBalance(id: string): Promise<number> {
  const { data } = await supabaseAdmin.from('accounts').select('balance').eq('id', id).maybeSingle();
  return data ? Number(data.balance) || 0 : 0;
}

async function setAccountBalance(id: string, currency: string, balance: number) {
  const { error } = await supabaseAdmin.from('accounts').upsert({
    id,
    name: id,
    type: id.startsWith('Efectivo') ? 'CASH' : 'BANK',
    currency,
    balance,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`No se pudo actualizar la cuenta ${id}: ${error.message}`);
}

async function getStock(currency: Currency) {
  const { data } = await supabaseAdmin
    .from('currency_stocks')
    .select('*')
    .eq('currency', currency)
    .maybeSingle();
  return {
    amount: data ? Number(data.amount) || 0 : 0,
    totalCost: data ? Number(data.total_cost_pyg) || 0 : 0,
    avg: data ? Number(data.average_cost) || 0 : 0,
  };
}

async function setStock(currency: Currency, amount: number, totalCost: number) {
  const safeAmount = Math.max(0, amount);
  const safeCost = safeAmount > 0 ? Math.max(0, totalCost) : 0;
  const { error } = await supabaseAdmin.from('currency_stocks').upsert({
    currency,
    amount: safeAmount,
    total_cost_pyg: safeCost,
    average_cost: safeAmount > 0 ? safeCost / safeAmount : 0,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`No se pudo actualizar el stock ${currency}: ${error.message}`);
}

export interface RecordResult {
  operation: Operation;
  /** Advertencias para mostrar al usuario (ej. vendió más de lo que tenía en stock). */
  warnings: string[];
}

/** Registra una operación en Supabase y actualiza cuentas + stock + PPP. */
export async function recordOperation(op: ValidatedOperation): Promise<RecordResult> {
  const warnings: string[] = [];

  const { data: maxOp, error: maxErr } = await supabaseAdmin
    .from('transactions')
    .select('operation_number')
    .order('operation_number', { ascending: false })
    .limit(1);
  if (maxErr) throw new Error(`Supabase no responde: ${maxErr.message}`);
  const operationNumber = maxOp && maxOp.length > 0 ? Number(maxOp[0].operation_number) + 1 : 1;

  let profit: number | null = null;

  if (op.type === 'COMPRA' && op.currency && op.amount && op.rate) {
    const pygBal = await getAccountBalance(op.account);
    await setAccountBalance(op.account, 'PYG', pygBal - op.totalPYG);
    if (pygBal - op.totalPYG < 0) {
      warnings.push(`El saldo de ${op.account} quedó en negativo.`);
    }

    const cashId = `Efectivo ${op.currency}`;
    const cash = await getAccountBalance(cashId);
    await setAccountBalance(cashId, op.currency, cash + op.amount);

    const stock = await getStock(op.currency);
    await setStock(op.currency, stock.amount + op.amount, stock.totalCost + op.totalPYG);
  } else if (op.type === 'VENTA' && op.currency && op.amount && op.rate) {
    const stock = await getStock(op.currency);

    if (stock.avg > 0) {
      profit = Math.round((op.rate - stock.avg) * op.amount);
    } else {
      warnings.push(
        `No había costo promedio cargado para ${op.currency}, así que no pude calcular la ganancia. Cargá el stock inicial en la web.`
      );
    }
    if (op.amount > stock.amount) {
      warnings.push(
        `Vendiste ${op.amount} ${op.currency} pero el stock registrado era ${stock.amount}. El stock quedó en 0.`
      );
    }

    const pygBal = await getAccountBalance(op.account);
    await setAccountBalance(op.account, 'PYG', pygBal + op.totalPYG);

    const cashId = `Efectivo ${op.currency}`;
    const cash = await getAccountBalance(cashId);
    await setAccountBalance(cashId, op.currency, Math.max(0, cash - op.amount));

    const costOfSold = stock.avg * op.amount;
    await setStock(op.currency, stock.amount - op.amount, stock.totalCost - costOfSold);
  } else if (op.type === 'GASTO') {
    const pygBal = await getAccountBalance(op.account);
    await setAccountBalance(op.account, 'PYG', pygBal - op.totalPYG);
  }

  const id = generateId();
  const timestamp = new Date().toISOString();
  const { error: txErr } = await supabaseAdmin.from('transactions').insert({
    id,
    operation_number: operationNumber,
    timestamp,
    type: op.type,
    currency: op.currency || null,
    amount: op.amount ?? null,
    rate: op.rate ?? null,
    total_pyg: op.totalPYG,
    account: op.account,
    profit,
    description: op.description || null,
  });
  if (txErr) throw new Error(`No se pudo guardar la operación: ${txErr.message}`);

  return {
    operation: {
      id,
      operationNumber,
      timestamp,
      type: op.type,
      currency: op.currency,
      amount: op.amount,
      rate: op.rate,
      totalPYG: op.totalPYG,
      account: op.account,
      profit: profit ?? undefined,
      description: op.description,
    },
    warnings,
  };
}

/** Elimina una operación y revierte su efecto en cuentas y stock. */
export async function deleteOperationById(id: string): Promise<Operation | null> {
  const { data: row, error } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`Supabase no responde: ${error.message}`);
  if (!row) return null;

  const total = Number(row.total_pyg) || 0;
  const amount = Number(row.amount) || 0;
  const currency = row.currency as Currency | null;

  if (row.type === 'COMPRA' && currency && amount) {
    await setAccountBalance(row.account, 'PYG', (await getAccountBalance(row.account)) + total);
    const cashId = `Efectivo ${currency}`;
    await setAccountBalance(cashId, currency, Math.max(0, (await getAccountBalance(cashId)) - amount));
    const stock = await getStock(currency);
    await setStock(currency, stock.amount - amount, stock.totalCost - total);
  } else if (row.type === 'VENTA' && currency && amount) {
    await setAccountBalance(row.account, 'PYG', (await getAccountBalance(row.account)) - total);
    const cashId = `Efectivo ${currency}`;
    await setAccountBalance(cashId, currency, (await getAccountBalance(cashId)) + amount);
    // Costo de lo vendido = total cobrado - ganancia. Sin ganancia registrada no había costo.
    const hasProfit = row.profit !== null && row.profit !== undefined;
    const costOfSold = hasProfit ? total - Number(row.profit) : 0;
    const stock = await getStock(currency);
    await setStock(currency, stock.amount + amount, stock.totalCost + costOfSold);
  } else if (row.type === 'GASTO') {
    await setAccountBalance(row.account, 'PYG', (await getAccountBalance(row.account)) + total);
  }

  const { error: delErr } = await supabaseAdmin.from('transactions').delete().eq('id', id);
  if (delErr) throw new Error(`No se pudo eliminar la operación: ${delErr.message}`);

  return {
    id: row.id,
    operationNumber: Number(row.operation_number),
    timestamp: row.timestamp,
    type: row.type,
    currency: currency || undefined,
    amount: amount || undefined,
    rate: row.rate ? Number(row.rate) : undefined,
    totalPYG: total,
    account: row.account,
    profit: row.profit !== null ? Number(row.profit) : undefined,
    description: row.description || undefined,
  };
}

/** Elimina la última operación registrada (comando "anular"). */
export async function deleteLastOperation(): Promise<Operation | null> {
  const { data } = await supabaseAdmin
    .from('transactions')
    .select('id')
    .order('operation_number', { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return null;
  return deleteOperationById(data[0].id);
}
