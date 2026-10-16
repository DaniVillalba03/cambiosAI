'use client';

import { useState } from 'react';
import {
  X,
  Settings,
  Save,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  Landmark,
  DollarSign,
  RotateCcw,
} from 'lucide-react';
import { useAppState } from '@/store/app-context';
import {
  Account,
  Currency,
  CURRENCIES,
  CURRENCY_FLAGS,
  CURRENCY_LABELS,
  CURRENCY_SYMBOLS,
  BANK_ACCOUNTS,
  CurrencyStock,
} from '@/types';
import { formatPYG, formatCurrency, cn } from '@/lib/utils';

interface AdjustCashModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdjustCashModal({ isOpen, onClose }: AdjustCashModalProps) {
  const { state, updateInitialBalances, clearHistory, resetData } = useAppState();

  // Local state for editing balances
  const [balances, setBalances] = useState<Record<Account, number>>(() => ({
    ...state.accountBalances,
  }));

  const [stocks, setStocks] = useState<Record<Currency, { amount: number; averageCost: number }>>(() => {
    const init = {} as Record<Currency, { amount: number; averageCost: number }>;
    CURRENCIES.forEach((cur) => {
      init[cur] = {
        amount: state.currencyStocks[cur]?.amount || 0,
        averageCost: state.currencyStocks[cur]?.averageCost || 0,
      };
    });
    return init;
  });

  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  if (!isOpen) return null;

  const handleBalanceChange = (account: Account, valStr: string) => {
    const num = parseFloat(valStr.replace(/\./g, '').replace(/,/g, '')) || 0;
    setBalances((prev) => ({ ...prev, [account]: num }));
  };

  const handleStockAmountChange = (currency: Currency, valStr: string) => {
    const num = parseFloat(valStr.replace(/\./g, '').replace(/,/g, '.')) || 0;
    setStocks((prev) => ({
      ...prev,
      [currency]: { ...prev[currency], amount: num },
    }));
  };

  const handleStockPPPChange = (currency: Currency, valStr: string) => {
    const num = parseFloat(valStr.replace(/\./g, '').replace(/,/g, '.')) || 0;
    setStocks((prev) => ({
      ...prev,
      [currency]: { ...prev[currency], averageCost: num },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    // Convert stocks to CurrencyStock format
    const formattedStocks = {} as Record<Currency, CurrencyStock>;
    CURRENCIES.forEach((cur) => {
      const s = stocks[cur];
      formattedStocks[cur] = {
        currency: cur,
        amount: s.amount,
        averageCost: s.averageCost,
        totalCostPYG: s.amount * s.averageCost,
      };
    });

    await updateInitialBalances(balances, formattedStocks);
    setIsSaving(false);
    setSuccessMsg('✅ ¡Caja inicial guardada y sincronizada correctamente!');
    setTimeout(() => {
      setSuccessMsg(null);
      onClose();
    }, 1500);
  };

  const handleClearHistory = async () => {
    setIsSaving(true);
    await clearHistory();
    setIsSaving(false);
    setShowClearConfirm(false);
    setSuccessMsg('🧹 Historial vaciado. Día iniciado en cero.');
    setTimeout(() => {
      setSuccessMsg(null);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-1 border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-2/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-accent/10 rounded-xl text-accent">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Configurar Caja Inicial / Nuevo Día</h2>
              <p className="text-xs text-gray-400">
                Ajustá tus saldos reales para arrancar el día con números precisos
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-surface-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {successMsg && (
            <div className="p-3.5 bg-profit/10 border border-profit/30 rounded-xl flex items-center gap-2 text-profit text-sm font-semibold">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              {successMsg}
            </div>
          )}

          {/* ─── 1. Saldos en Guaraníes ─── */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-accent" />
              1. Saldos en Guaraníes (Efectivo y Bancos)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Efectivo Gs. */}
              <div className="bg-surface-2/50 border border-border/50 rounded-xl p-3">
                <label className="text-xs text-gray-400 font-medium block mb-1">
                  💵 Efectivo en Mano (Gs.)
                </label>
                <input
                  type="number"
                  value={balances['Efectivo PYG'] || 0}
                  onChange={(e) => handleBalanceChange('Efectivo PYG', e.target.value)}
                  className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-white font-semibold focus:border-accent outline-none"
                />
              </div>

              {/* Bancos */}
              {BANK_ACCOUNTS.map((bank) => (
                <div key={bank} className="bg-surface-2/50 border border-border/50 rounded-xl p-3">
                  <label className="text-xs text-gray-400 font-medium block mb-1">
                    🏛️ {bank} (Gs.)
                  </label>
                  <input
                    type="number"
                    value={balances[bank] || 0}
                    onChange={(e) => handleBalanceChange(bank, e.target.value)}
                    className="w-full bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-white font-semibold focus:border-accent outline-none"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ─── 2. Stock y PPP de Divisas ─── */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-accent" />
              2. Stock Inicial de Divisas y Precio Promedio Ponderado (PPP)
            </h3>
            <div className="space-y-3">
              {CURRENCIES.map((cur) => (
                <div
                  key={cur}
                  className="bg-surface-2/50 border border-border/50 rounded-xl p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
                >
                  <div className="flex items-center gap-2 sm:w-36">
                    <span className="text-2xl">{CURRENCY_FLAGS[cur]}</span>
                    <div>
                      <p className="text-sm font-bold text-white">{cur}</p>
                      <p className="text-[10px] text-gray-400">{CURRENCY_LABELS[cur]}</p>
                    </div>
                  </div>

                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400 uppercase font-semibold block mb-1">
                        Cantidad Billetes ({CURRENCY_SYMBOLS[cur]})
                      </label>
                      <input
                        type="number"
                        value={stocks[cur]?.amount || 0}
                        onChange={(e) => handleStockAmountChange(cur, e.target.value)}
                        className="w-full bg-surface-1 border border-border rounded-lg px-3 py-1.5 text-sm text-white font-semibold focus:border-accent outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 uppercase font-semibold block mb-1">
                        Costo Compra PPP (Gs.)
                      </label>
                      <input
                        type="number"
                        value={stocks[cur]?.averageCost || 0}
                        onChange={(e) => handleStockPPPChange(cur, e.target.value)}
                        className="w-full bg-surface-1 border border-border rounded-lg px-3 py-1.5 text-sm text-white font-semibold focus:border-accent outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ─── 3. Iniciar Día en Cero ─── */}
          <div className="border-t border-border pt-4">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-red-400">
                    Limpiar operaciones de prueba / Iniciar Día en Cero
                  </h4>
                  <p className="text-xs text-gray-400 mt-1">
                    Borra las operaciones de ejemplo del historial para que arranques a registrar tus cambios reales
                    de hoy desde la Operación #1, manteniendo los saldos que configuraste arriba.
                  </p>

                  {showClearConfirm ? (
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={handleClearHistory}
                        disabled={isSaving}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors"
                      >
                        Sí, vaciar historial ahora
                      </button>
                      <button
                        onClick={() => setShowClearConfirm(false)}
                        className="px-3 py-1.5 bg-surface-2 text-gray-300 rounded-lg text-xs font-medium hover:bg-surface-3 transition-colors"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowClearConfirm(true)}
                      className="mt-3 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Vaciar Operaciones de Prueba
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-surface-2/40 flex items-center justify-between">
          <button
            onClick={() => resetData()}
            className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restaurar Demo
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-5 py-2.5 bg-accent hover:bg-accent-dim text-surface-0 font-bold rounded-xl text-sm transition-all shadow-lg shadow-accent/20 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Guardando...' : 'Guardar Caja Inicial'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
