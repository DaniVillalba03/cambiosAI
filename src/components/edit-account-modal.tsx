'use client';

import { useState, useEffect } from 'react';
import { X, Check, ArrowRight, RotateCcw } from 'lucide-react';
import { Account } from '@/types';
import { formatPYG, parseNumberString, formatThousandsInput } from '@/lib/utils';
import { BankLogo } from '@/components/bank-logo';

interface EditAccountModalProps {
  account: Account | null;
  currentBalance: number;
  isOpen: boolean;
  onClose: () => void;
  onSave: (account: Account, newBalance: number) => Promise<boolean | void>;
}

export function EditAccountModal({
  account,
  currentBalance,
  isOpen,
  onClose,
  onSave,
}: EditAccountModalProps) {
  const [displayValue, setDisplayValue] = useState<string>('0');
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (isOpen && account) {
      setDisplayValue(formatThousandsInput(currentBalance));
      setJustSaved(false);
    }
  }, [isOpen, account, currentBalance]);

  if (!isOpen || !account) return null;

  const currentNumericValue = parseNumberString(displayValue);
  const diff = currentNumericValue - currentBalance;

  const handleInputChange = (raw: string) => {
    // Si el usuario escribe o pega texto con o sin formato
    const num = parseNumberString(raw);
    setDisplayValue(formatThousandsInput(num));
  };

  const handleAdd = (delta: number) => {
    const next = Math.max(0, currentNumericValue + delta);
    setDisplayValue(formatThousandsInput(next));
  };

  const handleSetZero = () => {
    setDisplayValue('0');
  };

  const handleResetToCurrent = () => {
    setDisplayValue(formatThousandsInput(currentBalance));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(account, currentNumericValue);
      setJustSaved(true);
      setTimeout(() => {
        setIsSaving(false);
        setJustSaved(false);
        onClose();
      }, 700);
    } catch {
      setIsSaving(false);
    }
  };

  const isEfectivo = account === 'Efectivo PYG';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-surface-1 border border-border/80 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 bg-surface-2/60 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <BankLogo account={account} size="lg" />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-accent block">
                {isEfectivo ? 'Caja de Efectivo' : 'Cuenta Bancaria'}
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white">{account}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2.5 text-gray-400 hover:text-white rounded-2xl bg-surface-3/50 hover:bg-surface-3 transition-colors"
            aria-label="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Saldo Actual vs Nuevo */}
          <div className="p-4 rounded-2xl bg-surface-2/40 border border-border/40 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-400">Saldo actual registrado:</span>
            <span className="text-base sm:text-lg font-bold text-gray-200">
              {formatPYG(currentBalance)}
            </span>
          </div>

          {/* Gran Campo de Entrada */}
          <div className="space-y-2">
            <label className="text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-300 flex items-center justify-between">
              <span>Nuevo Saldo Disponible:</span>
              <span className="text-accent font-semibold normal-case text-xs">
                Guaraníes (Gs.)
              </span>
            </label>
            <div className="relative flex items-center bg-surface-0 border-2 border-accent/40 focus-within:border-accent rounded-2xl px-4 py-3 shadow-inner transition-colors">
              <span className="text-xl sm:text-2xl font-black text-accent mr-2 select-none">
                Gs.
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={displayValue}
                onChange={(e) => handleInputChange(e.target.value)}
                className="w-full bg-transparent text-2xl sm:text-3xl font-black text-white outline-none tracking-tight"
                placeholder="0"
                autoFocus
              />
              {currentNumericValue > 0 && (
                <button
                  type="button"
                  onClick={handleSetZero}
                  className="px-2.5 py-1 text-xs font-semibold text-gray-400 hover:text-red-400 bg-surface-2 hover:bg-surface-3 rounded-lg transition-colors ml-2 shrink-0"
                >
                  Poner en 0
                </button>
              )}
            </div>
            {/* Indicador de Diferencia */}
            <div className="flex items-center justify-between text-xs px-1 pt-1">
              {diff === 0 ? (
                <span className="text-gray-400">El saldo se mantendrá igual</span>
              ) : diff > 0 ? (
                <span className="text-profit font-bold">
                  Aumenta en: +{formatPYG(diff)}
                </span>
              ) : (
                <span className="text-loss font-bold">
                  Disminuye en: {formatPYG(diff)}
                </span>
              )}
              {diff !== 0 && (
                <button
                  type="button"
                  onClick={handleResetToCurrent}
                  className="text-gray-400 hover:text-gray-200 flex items-center gap-1 transition-colors underline"
                >
                  <RotateCcw className="w-3 h-3" /> Restaurar anterior
                </button>
              )}
            </div>
          </div>

          {/* Botones de Ajuste Rápido */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block">
              Sumar o restar rápido con un toque:
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleAdd(500_000)}
                className="py-2.5 px-2 bg-surface-2 hover:bg-surface-3 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl border border-white/5 transition-all text-center"
              >
                + 500 mil
              </button>
              <button
                type="button"
                onClick={() => handleAdd(1_000_000)}
                className="py-2.5 px-2 bg-surface-2 hover:bg-surface-3 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl border border-white/5 transition-all text-center"
              >
                + 1 millón
              </button>
              <button
                type="button"
                onClick={() => handleAdd(5_000_000)}
                className="py-2.5 px-2 bg-surface-2 hover:bg-surface-3 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl border border-white/5 transition-all text-center"
              >
                + 5 millones
              </button>
              <button
                type="button"
                onClick={() => handleAdd(10_000_000)}
                className="py-2.5 px-2 bg-surface-2 hover:bg-surface-3 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl border border-white/5 transition-all text-center"
              >
                + 10 millones
              </button>
              <button
                type="button"
                onClick={() => handleAdd(-1_000_000)}
                className="py-2.5 px-2 bg-surface-2 hover:bg-surface-3 active:scale-95 text-red-300 font-bold text-xs sm:text-sm rounded-xl border border-white/5 transition-all text-center"
              >
                - 1 millón
              </button>
              <button
                type="button"
                onClick={() => handleAdd(-5_000_000)}
                className="py-2.5 px-2 bg-surface-2 hover:bg-surface-3 active:scale-95 text-red-300 font-bold text-xs sm:text-sm rounded-xl border border-white/5 transition-all text-center"
              >
                - 5 millones
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-surface-2/60 border-t border-border/60 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-3.5 text-sm font-semibold text-gray-400 hover:text-white rounded-2xl hover:bg-surface-3 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-4 px-6 bg-emerald-500 hover:bg-emerald-400 text-surface-0 font-black text-base rounded-2xl shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {justSaved ? (
              <>
                <Check className="w-5 h-5 text-surface-0 stroke-[3]" />
                <span>¡Saldo Guardado!</span>
              </>
            ) : isSaving ? (
              <span>Guardando...</span>
            ) : (
              <>
                <Check className="w-5 h-5 text-surface-0 stroke-[3]" />
                <span>Guardar Saldo en {account}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
