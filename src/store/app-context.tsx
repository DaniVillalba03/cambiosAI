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
import { AppState, Currency, Operation, Account, CurrencyStock } from '@/types';
import { createSeedData } from '@/lib/seed-data';
import { generateId, isToday } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import {
  loadStateFromSupabase,
  syncTransactionToSupabase,
  deleteTransactionFromSupabase,
  saveInitialBalancesToSupabase,
  clearTransactionsInSupabase,
  SupabaseSyncStatus,
} from '@/lib/supabase-service';

// ─── Actions ───
type Action =
  | { type: 'LOAD_STATE'; payload: AppState }
  | { type: 'ADD_OPERATION'; payload: Omit<Operation, 'id' | 'operationNumber' | 'profit'> }
  | { type: 'DELETE_OPERATION'; payload: string }
  | {
      type: 'SET_INITIAL_BALANCES';
      payload: {
        accountBalances: Record<Account, number>;
        currencyStocks: Record<Currency, CurrencyStock>;
      };
    }
  | { type: 'CLEAR_HISTORY' }
  | { type: 'RESET' };

// ─── Reducer ───
function appReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'LOAD_STATE':
      return action.payload;

    case 'ADD_OPERATION': {
      const op = action.payload;
      const newState = structuredClone(state);
      const operationNumber = newState.nextOperationNumber;
      let profit: number | undefined;

      if (op.type === 'COMPRA' && op.currency && op.amount && op.rate) {
        const totalPYG = op.amount * op.rate;
        newState.accountBalances[op.account] -= totalPYG;
        const cashAccount = `Efectivo ${op.currency}` as Account;
        newState.accountBalances[cashAccount] = (newState.accountBalances[cashAccount] || 0) + op.amount;

        const stock = newState.currencyStocks[op.currency];
        stock.totalCostPYG += totalPYG;
        stock.amount += op.amount;
        stock.averageCost = stock.amount > 0 ? stock.totalCostPYG / stock.amount : 0;

        const newOp: Operation = {
          ...op,
          id: generateId(),
          operationNumber,
          totalPYG,
          profit: undefined,
        };
        newState.operations.push(newOp);
      } else if (op.type === 'VENTA' && op.currency && op.amount && op.rate) {
        const totalPYG = op.amount * op.rate;
        const stock = newState.currencyStocks[op.currency];
        const avgCost = stock.averageCost;
        profit = Math.round((op.rate - avgCost) * op.amount);

        const cashAccount = `Efectivo ${op.currency}` as Account;
        newState.accountBalances[cashAccount] = (newState.accountBalances[cashAccount] || 0) - op.amount;
        newState.accountBalances[op.account] += totalPYG;

        const costOfSold = avgCost * op.amount;
        stock.amount -= op.amount;
        stock.totalCostPYG = Math.max(0, stock.totalCostPYG - costOfSold);
        stock.averageCost = stock.amount > 0 ? stock.totalCostPYG / stock.amount : 0;

        const newOp: Operation = {
          ...op,
          id: generateId(),
          operationNumber,
          totalPYG,
          profit,
        };
        newState.operations.push(newOp);
      } else if (op.type === 'GASTO') {
        newState.accountBalances[op.account] -= op.totalPYG;
        const newOp: Operation = {
          ...op,
          id: generateId(),
          operationNumber,
          profit: undefined,
        };
        newState.operations.push(newOp);
      }

      newState.nextOperationNumber = operationNumber + 1;
      return newState;
    }

    case 'DELETE_OPERATION': {
      const opId = action.payload;
      const op = state.operations.find((o) => o.id === opId);
      if (!op) return state;

      const newState = structuredClone(state);

      if (op.type === 'COMPRA' && op.currency && op.amount && op.rate) {
        newState.accountBalances[op.account] += op.totalPYG;
        const cashAccount = `Efectivo ${op.currency}` as Account;
        newState.accountBalances[cashAccount] = (newState.accountBalances[cashAccount] || 0) - op.amount;
        const stock = newState.currencyStocks[op.currency];
        stock.totalCostPYG -= op.totalPYG;
        stock.amount -= op.amount;
        stock.averageCost = stock.amount > 0 ? stock.totalCostPYG / stock.amount : 0;
      } else if (op.type === 'VENTA' && op.currency && op.amount && op.rate) {
        const cashAccount = `Efectivo ${op.currency}` as Account;
        newState.accountBalances[cashAccount] = (newState.accountBalances[cashAccount] || 0) + op.amount;
        newState.accountBalances[op.account] -= op.totalPYG;
        const stock = newState.currencyStocks[op.currency];
        const costOfSold = (op.rate - (op.profit || 0) / op.amount) * op.amount;
        stock.amount += op.amount;
        stock.totalCostPYG += costOfSold;
        stock.averageCost = stock.amount > 0 ? stock.totalCostPYG / stock.amount : 0;
      } else if (op.type === 'GASTO') {
        newState.accountBalances[op.account] += op.totalPYG;
      }

      newState.operations = newState.operations.filter((o) => o.id !== opId);
      return newState;
    }

    case 'SET_INITIAL_BALANCES': {
      return {
        ...state,
        accountBalances: action.payload.accountBalances,
        currencyStocks: action.payload.currencyStocks,
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
  addOperation: (op: Omit<Operation, 'id' | 'operationNumber' | 'profit'>) => void;
  deleteOperation: (id: string) => void;
  updateInitialBalances: (
    accountBalances: Record<Account, number>,
    currencyStocks: Record<Currency, CurrencyStock>
  ) => Promise<boolean>;
  clearHistory: () => Promise<boolean>;
  resetData: () => void;
  todayOperations: Operation[];
  todayProfit: number; // Ganancia Cambiaria Pura por Spread
  todayExpenses: number; // Gastos Operativos / Personales
  todayNetFlow: number; // Flujo Neto Final = Ganancia Cambiaria - Gastos
  todayVolume: number;
  supabaseStatus: SupabaseSyncStatus;
  refreshFromSupabase: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = 'cambiosai_state';

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, null as unknown as AppState, () => {
    return createSeedData();
  });

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
      // Fallback a localStorage si Supabase no está listo
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as AppState;
          dispatch({ type: 'LOAD_STATE', payload: parsed });
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    refreshFromSupabase();
  }, [refreshFromSupabase]);

  // 2. Suscribirse a cambios en tiempo real (Supabase Realtime)
  useEffect(() => {
    const channel = supabase
      .channel('cambiosai_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => {
          refreshFromSupabase();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accounts' },
        () => {
          refreshFromSupabase();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'currency_stocks' },
        () => {
          refreshFromSupabase();
        }
      )
      .subscribe();

    return () => {
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

  // 4. Agregar operación (memoria + Supabase)
  const addOperation = useCallback(
    (op: Omit<Operation, 'id' | 'operationNumber' | 'profit'>) => {
      // Primero actualizamos en el reducer
      dispatch({ type: 'ADD_OPERATION', payload: op });

      // Si Supabase está conectado, sincronizamos en segundo plano
      setTimeout(async () => {
        const currentState = stateRef.current;
        const lastOp = currentState.operations[currentState.operations.length - 1];
        if (lastOp) {
          await syncTransactionToSupabase(
            lastOp,
            currentState.accountBalances,
            currentState.currencyStocks
          );
        }
      }, 50);
    },
    []
  );

  // 5. Eliminar operación (memoria + Supabase)
  const deleteOperation = useCallback((id: string) => {
    const op = stateRef.current.operations.find((o) => o.id === id);
    dispatch({ type: 'DELETE_OPERATION', payload: id });

    if (op) {
      setTimeout(async () => {
        const currentState = stateRef.current;
        const affected: Account[] = [op.account];
        if (op.currency) affected.push(`Efectivo ${op.currency}` as Account);
        await deleteTransactionFromSupabase(
          id,
          currentState.accountBalances,
          currentState.currencyStocks,
          affected,
          op.currency
        );
      }, 50);
    }
  }, []);

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
        addOperation,
        deleteOperation,
        updateInitialBalances,
        clearHistory,
        resetData,
        todayOperations,
        todayProfit,
        todayExpenses,
        todayNetFlow,
        todayVolume,
        supabaseStatus,
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
