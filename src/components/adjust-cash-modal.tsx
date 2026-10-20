'use client';

import { useState, useEffect } from 'react';
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
  ChevronDown,
  ChevronUp,
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
import { formatPYG, formatCurrency, parseNumberString, formatThousandsInput } from '@/lib/utils';
import { BankLogo } from '@/components/bank-logo';

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
  const [showDangerZone, setShowDangerZone] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setBalances({ ...state.accountBalances });
      const init = {} as Record<Currency, { amount: number; averageCost: number }>;
      CURRENCIES.forEach((cur) => {
        init[cur] = {
          amount: state.currencyStocks[cur]?.amount || 0,
          averageCost: state.currencyStocks[cur]?.averageCost || 0,
        };
      });
      setStocks(init);
      setSuccessMsg(null);
      setShowClearConfirm(false);
    }
  }, [isOpen, state]);

  if (!isOpen) return null;

  const handleBalanceChange = (account: Account, valStr: string) => {
    const num = parseNumberString(valStr);
    setBalances((prev) => ({ ...prev, [account]: num }));
  };

  const handleStockAmountChange = (currency: Currency, valStr: string) => {
    const num = parseNumberString(valStr);
    setStocks((prev) => ({
      ...prev,
      [currency]: { ...prev[currency], amount: num },
    }));
  };

  const handleStockPPPChange = (currency: Currency, valStr: string) => {
    const num = parseNumberString(valStr);
    setStocks((prev) => ({
      ...prev,
      [currency]: { ...prev[currency], averageCost: num },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
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
    setSuccessMsg('✅ ¡Todos los saldos y billetes fueron guardados correctamente!');
    setTimeout(() => {
      setSuccessMsg(null);
      onClose();
    }, 1200);
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
    }, 1200);
  };

  const totalPYGCapital =
    (balances['Efectivo PYG'] || 0) +
    BANK_ACCOUNTS.reduce((sum, bank) => sum + (balances[bank] || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-surface-1 border border-border/80 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-surface-2/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-accent/10 rounded-2xl text-accent">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-white">Ajustar Todo tu Capital</h2>
              <p className="text-xs text-gray-400">
                Establecé el dinero real en cada banco y los billetes disponibles
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-surface-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {successMsg && (
            <div className="p-4 bg-profit/15 border border-profit/30 rounded-2xl flex items-center gap-2.5 text-profit text-sm font-bold animate-fade-in">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              {successMsg}
            </div>
          )}

          {/* Banner de Capital Total Guaraníes */}
          <div className="p-4 rounded-2xl bg-surface-2/60 border border-accent/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block">
                Capital Total en Guaraníes
              </span>
              <span className="text-xs text-gray-400">Suma de efectivo y todos los bancos</span>
            </div>
            <p className="text-2xl font-black text-accent tracking-tight">
              {formatPYG(totalPYGCapital)}
            </p>
          </div>

          {/* ─── 1. Saldos en Guaraníes ─── */}
          <div>
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Wallet className="w-4 h-4 text-accent" />
              1. Dinero en Efectivo y Bancos (Gs.)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Efectivo Gs. */}
              <div className="bg-surface-2/40 border border-emerald-500/20 rounded-2xl p-3.5 space-y-1.5">
                <label className="text-xs text-gray-300 font-bold flex items-center gap-2">
                  <BankLogo account="Efectivo PYG" size="xs" />
                  <span>Efectivo en Mano (Gs.)</span>
                </label>
                <div className="relative flex items-center bg-surface-0 border border-border focus-within:border-accent rounded-xl px-3 py-2">
                  <span className="text-xs font-bold text-gray-400 mr-2 select-none">Gs.</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formatThousandsInput(balances['Efectivo PYG'] || 0)}
                    onChange={(e) => handleBalanceChange('Efectivo PYG', e.target.value)}
                    className="w-full bg-transparent text-base font-black text-white outline-none"
                  />
                </div>
              </div>

              {/* Bancos */}
              {BANK_ACCOUNTS.map((bank) => (
                <div key={bank} className="bg-surface-2/40 border border-border/50 rounded-2xl p-3.5 space-y-1.5">
                  <label className="text-xs text-gray-300 font-bold flex items-center gap-2">
                    <BankLogo account={bank} size="xs" />
                    <span>{bank}</span>
                  </label>
                  <div className="relative flex items-center bg-surface-0 border border-border focus-within:border-accent rounded-xl px-3 py-2">
                    <span className="text-xs font-bold text-gray-400 mr-2 select-none">Gs.</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={formatThousandsInput(balances[bank] || 0)}
                      onChange={(e) => handleBalanceChange(bank, e.target.value)}
                      className="w-full bg-transparent text-base font-black text-white outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ─── 2. Stock y Costo de Divisas ─── */}
          <div>
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-accent" />
              2. Billetes de Moneda Extranjera en Mano
            </h3>
            <div className="space-y-3">
              {CURRENCIES.map((cur) => (
                <div
                  key={cur}
                  className="bg-surface-2/40 border border-border/50 rounded-2xl p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
                >
                  <div className="flex items-center gap-2.5 sm:w-36">
                    <span className="text-3xl select-none">{CURRENCY_FLAGS[cur]}</span>
                    <div>
                      <p className="text-sm font-black text-white">{cur}</p>
                      <p className="text-[11px] text-gray-400">{CURRENCY_LABELS[cur]}</p>
                    </div>
                  </div>

                  <div className="flex-1 grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] text-gray-400 uppercase font-bold block mb-1">
                        Billetes ({CURRENCY_SYMBOLS[cur]})
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatThousandsInput(stocks[cur]?.amount || 0)}
                        onChange={(e) => handleStockAmountChange(cur, e.target.value)}
                        className="w-full bg-surface-0 border border-border rounded-xl px-3 py-2 text-sm text-white font-black focus:border-accent outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-gray-400 uppercase font-bold block mb-1">
                        Costo Compra (Gs.)
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={formatThousandsInput(stocks[cur]?.averageCost || 0)}
                        onChange={(e) => handleStockPPPChange(cur, e.target.value)}
                        className="w-full bg-surface-0 border border-border rounded-xl px-3 py-2 text-sm text-white font-black focus:border-accent outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ─── 3. Zona Avanzada / Reiniciar (Protegida) ─── */}
          <div className="border-t border-border/60 pt-4">
            <button
              type="button"
              onClick={() => setShowDangerZone(!showDangerZone)}
              className="text-xs text-gray-400 hover:text-gray-300 flex items-center justify-between w-full py-1 font-semibold"
            >
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                Opciones avanzadas (Reiniciar operaciones)
              </span>
              {showDangerZone ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showDangerZone && (
              <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                <h4 className="text-xs font-bold text-red-300">
                  Vaciar operaciones registradas y arrancar día en cero
                </h4>
                <p className="text-[11px] text-gray-400 mt-1">
                  Borra el historial de movimientos de hoy conservando los saldos que configuraste arriba.
                </p>

                {showClearConfirm ? (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      onClick={handleClearHistory}
                      disabled={isSaving}
                      className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors"
                    >
                      Sí, vaciar historial ahora
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      className="px-3 py-2 bg-surface-2 text-gray-300 rounded-xl text-xs font-medium hover:bg-surface-3 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="mt-3 px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Vaciar Operaciones de Hoy
                  </button>
                )}
              </div>
            )}
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
              className="px-4 py-2.5 text-sm font-semibold text-gray-400 hover:text-white rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-surface-0 font-black rounded-2xl text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2"
            >
              <Save className="w-4 h-4 stroke-[2.5]" />
              {isSaving ? 'Guardando...' : 'Guardar Todo el Capital'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
