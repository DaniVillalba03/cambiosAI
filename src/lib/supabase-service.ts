import { supabase, supabaseAdmin } from './supabase';
import { AppState, Currency, Operation, Account, ALL_ACCOUNTS, CURRENCIES } from '@/types';

export interface SupabaseSyncStatus {
  connected: boolean;
  tableMissing: boolean;
  message?: string;
}

/**
 * Carga el estado completo desde Supabase.
 * Si las tablas aún no existen en Supabase (error 42P01), retorna tableMissing: true sin romper la app.
 */
export async function loadStateFromSupabase(): Promise<{
  state: AppState | null;
  status: SupabaseSyncStatus;
}> {
  try {
    // 1. Verificar tabla accounts
    const { data: accountsData, error: accountsError } = await supabase
      .from('accounts')
      .select('*');

    if (accountsError) {
      const isMissing = accountsError.code === '42P01' || accountsError.message?.includes('relation');
      return {
        state: null,
        status: {
          connected: false,
          tableMissing: isMissing,
          message: isMissing
            ? 'Las tablas aún no existen en Supabase. Ejecutá el archivo supabase-schema.sql en el SQL Editor de Supabase.'
            : accountsError.message,
        },
      };
    }

    // 2. Cargar stocks
    const { data: stocksData, error: stocksError } = await supabase
      .from('currency_stocks')
      .select('*');

    if (stocksError) {
      console.warn('Error loading currency_stocks:', stocksError);
    }

    // 3. Cargar operaciones
    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .select('*')
      .order('timestamp', { ascending: true });

    if (txError) {
      console.warn('Error loading transactions:', txError);
    }

    // Mapear cuentas
    const accountBalances = {} as Record<Account, number>;
    // Inicializar con 0
    ALL_ACCOUNTS.forEach((acc) => {
      accountBalances[acc] = 0;
    });

    if (accountsData && accountsData.length > 0) {
      accountsData.forEach((row: any) => {
        if (row.name in accountBalances || row.id in accountBalances) {
          accountBalances[(row.name || row.id) as Account] = Number(row.balance);
        }
      });
    }

    // Mapear stocks
    const currencyStocks = {} as Record<Currency, AppState['currencyStocks'][Currency]>;
    CURRENCIES.forEach((cur) => {
      currencyStocks[cur] = { currency: cur, amount: 0, totalCostPYG: 0, averageCost: 0 };
    });

    if (stocksData && stocksData.length > 0) {
      stocksData.forEach((row: any) => {
        const cur = row.currency as Currency;
        if (CURRENCIES.includes(cur)) {
          currencyStocks[cur] = {
            currency: cur,
            amount: Number(row.amount || 0),
            totalCostPYG: Number(row.total_cost_pyg || 0),
            averageCost: Number(row.average_cost || 0),
          };
        }
      });
    }

    // Mapear transacciones
    const operations: Operation[] = (txData || []).map((row: any) => ({
      id: row.id,
      operationNumber: Number(row.operation_number),
      timestamp: row.timestamp,
      type: row.type,
      currency: row.currency || undefined,
      amount: row.amount ? Number(row.amount) : undefined,
      rate: row.rate ? Number(row.rate) : undefined,
      totalPYG: Number(row.total_pyg),
      account: row.account as Account,
      profit: row.profit !== null && row.profit !== undefined ? Number(row.profit) : undefined,
      description: row.description || undefined,
    }));

    const maxOpNum = operations.reduce((max, op) => Math.max(max, op.operationNumber), 0);

    return {
      state: {
        operations,
        currencyStocks,
        accountBalances,
        nextOperationNumber: maxOpNum + 1,
      },
      status: { connected: true, tableMissing: false },
    };
  } catch (err: any) {
    console.warn('Excepción al conectar con Supabase:', err);
    return {
      state: null,
      status: {
        connected: false,
        tableMissing: false,
        message: err.message || 'No se pudo conectar a Supabase',
      },
    };
  }
}

/**
 * Guarda una nueva transacción y actualiza saldos en Supabase
 */
export async function syncTransactionToSupabase(
  op: Operation,
  newBalances: Record<Account, number>,
  newStocks: Record<Currency, AppState['currencyStocks'][Currency]>
): Promise<boolean> {
  try {
    // 1. Insertar transacción
    const { error: txErr } = await supabase.from('transactions').upsert({
      id: op.id,
      operation_number: op.operationNumber,
      timestamp: op.timestamp,
      type: op.type,
      currency: op.currency || null,
      amount: op.amount || null,
      rate: op.rate || null,
      total_pyg: op.totalPYG,
      account: op.account,
      profit: op.profit ?? null,
      description: op.description || null,
    });

    if (txErr) {
      console.warn('Error syncing tx to Supabase:', txErr);
      return false;
    }

    // 2. Actualizar cuenta afectada
    const affectedAccounts: Account[] = [op.account];
    if (op.currency) {
      affectedAccounts.push(`Efectivo ${op.currency}` as Account);
    }

    for (const acc of affectedAccounts) {
      const balance = newBalances[acc];
      await supabase
        .from('accounts')
        .update({ balance, updated_at: new Date().toISOString() })
        .eq('id', acc);
    }

    // 3. Actualizar stock si fue divisa
    if (op.currency && newStocks[op.currency]) {
      const s = newStocks[op.currency];
      await supabase
        .from('currency_stocks')
        .update({
          amount: s.amount,
          total_cost_pyg: s.totalCostPYG,
          average_cost: s.averageCost,
          updated_at: new Date().toISOString(),
        })
        .eq('currency', op.currency);
    }

    return true;
  } catch (err) {
    console.warn('Exception syncing to Supabase:', err);
    return false;
  }
}

/**
 * Elimina una transacción en Supabase y actualiza saldos
 */
export async function deleteTransactionFromSupabase(
  opId: string,
  newBalances: Record<Account, number>,
  newStocks: Record<Currency, AppState['currencyStocks'][Currency]>,
  affectedAccounts: Account[],
  affectedCurrency?: Currency
): Promise<boolean> {
  try {
    const { error } = await supabase.from('transactions').delete().eq('id', opId);
    if (error) {
      console.warn('Error deleting tx from Supabase:', error);
      return false;
    }

    for (const acc of affectedAccounts) {
      await supabase
        .from('accounts')
        .update({ balance: newBalances[acc], updated_at: new Date().toISOString() })
        .eq('id', acc);
    }

    if (affectedCurrency && newStocks[affectedCurrency]) {
      const s = newStocks[affectedCurrency];
      await supabase
        .from('currency_stocks')
        .update({
          amount: s.amount,
          total_cost_pyg: s.totalCostPYG,
          average_cost: s.averageCost,
          updated_at: new Date().toISOString(),
        })
        .eq('currency', affectedCurrency);
    }

    return true;
  } catch (err) {
    console.warn('Exception deleting tx from Supabase:', err);
    return false;
  }
}

/**
 * Guarda el arqueo/caja inicial configurado manualmente por el usuario
 */
export async function saveInitialBalancesToSupabase(
  accountBalances: Record<Account, number>,
  currencyStocks: Record<Currency, AppState['currencyStocks'][Currency]>
): Promise<boolean> {
  try {
    // 1. Actualizar balances de cuentas
    for (const [acc, bal] of Object.entries(accountBalances)) {
      await supabase
        .from('accounts')
        .update({ balance: bal, initial_balance: bal, updated_at: new Date().toISOString() })
        .eq('id', acc);
    }

    // 2. Actualizar stocks
    for (const [cur, stock] of Object.entries(currencyStocks)) {
      await supabase
        .from('currency_stocks')
        .update({
          amount: stock.amount,
          total_cost_pyg: stock.totalCostPYG,
          average_cost: stock.averageCost,
          updated_at: new Date().toISOString(),
        })
        .eq('currency', cur);
    }

    return true;
  } catch (err) {
    console.warn('Exception saving initial balances to Supabase:', err);
    return false;
  }
}

/**
 * Limpia todas las operaciones de prueba y resetea las cajas
 */
export async function clearTransactionsInSupabase(): Promise<boolean> {
  try {
    const { error } = await supabase.from('transactions').delete().neq('id', 'keep_all');
    if (error) {
      console.warn('Error clearing transactions in Supabase:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Exception clearing transactions in Supabase:', err);
    return false;
  }
}

/**
 * Actualiza el saldo de una sola cuenta bancaria o efectivo en Supabase
 */
export async function saveSingleAccountBalanceToSupabase(
  account: Account,
  balance: number
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('accounts')
      .update({
        balance,
        initial_balance: balance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', account);

    if (error) {
      console.warn(`Error updating balance for ${account} in Supabase:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`Exception updating balance for ${account} in Supabase:`, err);
    return false;
  }
}

/**
 * Actualiza la cantidad o costo de una sola divisa en Supabase
 */
export async function saveSingleCurrencyStockToSupabase(
  currency: Currency,
  amount: number,
  averageCost: number
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('currency_stocks')
      .update({
        amount,
        average_cost: averageCost,
        total_cost_pyg: amount * averageCost,
        updated_at: new Date().toISOString(),
      })
      .eq('currency', currency);

    if (error) {
      console.warn(`Error updating currency stock for ${currency} in Supabase:`, error);
      return false;
    }

    // Actualizar también la cuenta de efectivo correspondiente
    const cashAccount = `Efectivo ${currency}`;
    await supabase
      .from('accounts')
      .update({
        balance: amount,
        initial_balance: amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cashAccount);

    return true;
  } catch (err) {
    console.warn(`Exception updating currency stock for ${currency} in Supabase:`, err);
    return false;
  }
}


