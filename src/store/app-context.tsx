'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useRef,
} from 'react';
import { AppState, Currency, Account, CurrencyStock, Operation } from '@/types';
import { createSeedData, createEmptyState } from '@/lib/seed-data';
import { isToday } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import {
  loadStateFromSupabase,
  saveInitialBalancesToSupabase,
  saveSingleAccountBalanceToSupabase,
  saveSingleCurrencyStockToSupabase,
  clearTransactionsInSupabase,
  SupabaseSyncStatus,
} from '@/lib/supabase-service';


// ─── Actions ───
type Action =
  | { type: 'LOAD_STATE'; payload: AppState }
  | {
      type: 'SET_INITIAL_BALANCES';
      payload: {
        accountBalances: Record<Account, number>;
        currencyStocks: Record<Currency, CurrencyStock>;
      };
    }
  | {
      type: 'SET_SINGLE_ACCOUNT_BALANCE';
      payload: { account: Account; balance: number };
    }
  | {
      type: 'SET_SINGLE_CURRENCY_STOCK';
      payload: { currency: Currency; amount: number; averageCost?: number };
    }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'RESET' };

// ─── Reducer ───
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD_STATE':
      return action.payload;

    case 'SET_INITIAL_BALANCES': {
      return {
        ...state,
        accountBalances: action.payload.accountBalances,
        currencyStocks: action.payload.currencyStocks,
      };
    }

    case 'SET_SINGLE_ACCOUNT_BALANCE': {
      return {
        ...state,
        accountBalances: {
          ...state.accountBalances,
          [action.payload.account]: action.payload.balance,
        },
      };
    }

    case 'SET_SINGLE_CURRENCY_STOCK': {
      const { currency, amount, averageCost } = action.payload;
      const current = state.currencyStocks[currency] || {
        currency,
        amount: 0,
        totalCostPYG: 0,
        averageCost: 0,
      };
      const avg = averageCost !== undefined ? averageCost : current.averageCost;
      const cashAccount = `Efectivo ${currency}` as Account;
      return {
        ...state,
        accountBalances: {
          ...state.accountBalances,
          [cashAccount]: amount,
        },
        currencyStocks: {
          ...state.currencyStocks,
          [currency]: {
            currency,
            amount,
            averageCost: avg,
            totalCostPYG: amount * avg,
          },
        },
      };
    }


    case 'CLEAR_HISTORY': {
      return {
        ...state,
        operations: [],
        nextOperationNumber: 1,
      };
    }

    case 'RESET':
      return createSeedData();

    default:
      return state;
  }
}

// ─── Context Interface ───
interface AppContextValue {
  state: AppState;
  isLoaded: boolean;
  deleteOperation: (id: string) => Promise<boolean>;
  updateInitialBalances: (
    accountBalances: Record<Account, number>,
    currencyStocks: Record<Currency, CurrencyStock>
  ) => Promise<boolean>;
  updateSingleAccountBalance: (account: Account, balance: number) => Promise<boolean>;
  updateSingleCurrencyStock: (
    currency: Currency,
    amount: number,
    averageCost?: number
  ) => Promise<boolean>;
  clearHistory: () => Promise<boolean>;
  resetData: () => void;
  todayOperations: Operation[];
  todayProfit: number; // Ganancia Cambiaria Pura por Spread
  todayExpenses: number; // Gastos Operativos / Personales
  todayNetFlow: number; // Flujo Neto Final = Ganancia Cambiaria - Gastos
  todayVolume: number;
  supabaseStatus: SupabaseSyncStatus;
  realtimeStatus: string;
  refreshFromSupabase: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = 'cambiosai_state';

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, null as unknown as AppState, () => {
    return createEmptyState();
  });

  const [isLoaded, setIsLoaded] = useState(false);

  const [supabaseStatus, setSupabaseStatus] = useState<SupabaseSyncStatus>({
    connected: false,
    tableMissing: false,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  // 1. Cargar desde Supabase y respaldar en localStorage
  const refreshFromSupabase = useCallback(async () => {
    const { state: cloudState, status } = await loadStateFromSupabase();
    setSupabaseStatus(status);

    if (cloudState && status.connected) {
      dispatch({ type: 'LOAD_STATE', payload: cloudState });
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudState));
      } catch {}
    } else {
      // Fallback a localStorage si Supabase no está conectado
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as AppState;
          dispatch({ type: 'LOAD_STATE', payload: parsed });
        }
      } catch {}
    }
    setIsLoaded(true);
  }, []);

  // Cargar inmediatamente desde localStorage al montar en el cliente (0 ms de espera)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as AppState;
        dispatch({ type: 'LOAD_STATE', payload: parsed });
      }
    } catch {}
    setIsLoaded(true);

    refreshFromSupabase();
  }, [refreshFromSupabase]);

  // 2. Suscribirse a cambios en tiempo real (Supabase Realtime).
  //    Una operación dispara varios eventos (cuentas, stock, transacción):
  //    agrupamos en una sola recarga con un pequeño debounce.
  const [realtimeStatus, setRealtimeStatus] = useState<string>('CONNECTING');
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => refreshFromSupabase(), 250);
    };

    const channel = supabase
      .channel('micambio_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'currency_stocks' }, scheduleRefresh)
      .subscribe((status) => setRealtimeStatus(status));

    // Al volver a la pestaña/app, refrescar por si se perdió algún evento
    const onVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [refreshFromSupabase]);

  // 3. Persistir en localStorage en cada cambio local
  useEffect(() => {
    if (state) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {}
    }
  }, [state]);

  // 4. Eliminar operación: lo hace el servidor (misma lógica que "anular" de WhatsApp)
  const deleteOperation = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/operations/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) return false;
        await refreshFromSupabase();
        return true;
      } catch {
        return false;
      }
    },
    [refreshFromSupabase]
  );

  // 6. Configurar saldo inicial / arqueo inicial
  const updateInitialBalances = useCallback(
    async (
      accountBalances: Record<Account, number>,
      currencyStocks: Record<Currency, CurrencyStock>
    ) => {
      dispatch({
        type: 'SET_INITIAL_BALANCES',
        payload: { accountBalances, currencyStocks },
      });
      return await saveInitialBalancesToSupabase(accountBalances, currencyStocks);
    },
    []
  );

  // 6.b Actualizar saldo de una sola cuenta (banco o efectivo)
  const updateSingleAccountBalance = useCallback(
    async (account: Account, balance: number) => {
      dispatch({
        type: 'SET_SINGLE_ACCOUNT_BALANCE',
        payload: { account, balance },
      });
      return await saveSingleAccountBalanceToSupabase(account, balance);
    },
    []
  );

  // 6.c Actualizar stock de una sola divisa (USD, BRL, ARS, EUR)
  const updateSingleCurrencyStock = useCallback(
    async (currency: Currency, amount: number, averageCost?: number) => {
      dispatch({
        type: 'SET_SINGLE_CURRENCY_STOCK',
        payload: { currency, amount, averageCost },
      });
      const avg =
        averageCost !== undefined
          ? averageCost
          : stateRef.current.currencyStocks[currency]?.averageCost || 0;
      return await saveSingleCurrencyStockToSupabase(currency, amount, avg);
    },
    []
  );

  // 7. Limpiar operaciones de prueba para arrancar en cero
  const clearHistory = useCallback(async () => {
    dispatch({ type: 'CLEAR_HISTORY' });
    return await clearTransactionsInSupabase();
  }, []);

  const resetData = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Métricas calculadas
  const todayOperations = state.operations.filter((op) => isToday(op.timestamp));
  // Ganancia Cambiaria pura por spread (sin restar gastos)
  const todayProfit = todayOperations.reduce((sum, op) => sum + (op.profit || 0), 0);
  // Gastos operativos / personales
  const todayExpenses = todayOperations
    .filter((op) => op.type === 'GASTO')
    .reduce((sum, op) => sum + op.totalPYG, 0);
  // Flujo Neto Final
  const todayNetFlow = todayProfit - todayExpenses;
  // Volumen operado
  const todayVolume = todayOperations
    .filter((op) => op.type !== 'GASTO')
    .reduce((sum, op) => sum + op.totalPYG, 0);

  return (
    <AppContext.Provider
      value={{
        state,
        isLoaded,
        deleteOperation,
        updateInitialBalances,
        updateSingleAccountBalance,
        updateSingleCurrencyStock,
        clearHistory,
        resetData,
        todayOperations,
        todayProfit,
        todayExpenses,
        todayNetFlow,
        todayVolume,
        supabaseStatus,
        realtimeStatus,
        refreshFromSupabase,
      }}
    >
      {children}
    </AppContext.Provider>
  );


}

export function useAppState() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppState must be used within AppProvider');
  return ctx;
}
