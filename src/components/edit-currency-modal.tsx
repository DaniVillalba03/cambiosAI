'use client';

import { useState, useEffect } from 'react';
import { X, Check, RotateCcw, DollarSign } from 'lucide-react';
import { Currency, CURRENCY_FLAGS, CURRENCY_LABELS, CURRENCY_SYMBOLS, CurrencyStock } from '@/types';
import { formatCurrency, formatPYG, parseNumberString, formatThousandsInput } from '@/lib/utils';

interface EditCurrencyModalProps {
  currency: Currency | null;
  currentStock: CurrencyStock | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (currency: Currency, amount: number, averageCost?: number) => Promise<boolean | void>;
}

export function EditCurrencyModal({
  currency,
  currentStock,
  isOpen,
  onClose,
  onSave,
}: EditCurrencyModalProps) {
  const [amountStr, setAmountStr] = useState<string>('0');
  const [pppStr, setPppStr] = useState<string>('0');
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (isOpen && currency && currentStock) {
      setAmountStr(formatThousandsInput(currentStock.amount));
      setPppStr(formatThousandsInput(Math.round(currentStock.averageCost || 0)));
      setJustSaved(false);
    }
  }, [isOpen, currency, currentStock]);

  if (!isOpen || !currency || !currentStock) return null;

  const currentNumericAmount = parseNumberString(amountStr);
  const currentNumericPPP = parseNumberString(pppStr);
  const diff = currentNumericAmount - currentStock.amount;

  const handleAmountChange = (raw: string) => {
    const num = parseNumberString(raw);
    setAmountStr(formatThousandsInput(num));
  };

  const handlePppChange = (raw: string) => {
    const num = parseNumberString(raw);
    setPppStr(formatThousandsInput(num));
  };

  const handleAddAmount = (delta: number) => {
    const next = Math.max(0, currentNumericAmount + delta);
    setAmountStr(formatThousandsInput(next));
  };

  const handleSetZero = () => {
    setAmountStr('0');
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(currency, currentNumericAmount, currentNumericPPP);
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

  const symbol = CURRENCY_SYMBOLS[currency];
  const flag = CURRENCY_FLAGS[currency];
  const label = CURRENCY_LABELS[currency];

  const quickSteps =
    currency === 'ARS'
      ? [10_000, 50_000, 100_000, 500_000]
      : [50, 100, 500, 1000];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="bg-surface-1 border border-border/80 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 bg-surface-2/60 border-b border-border/60 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <span className="text-4xl select-none">{flag}</span>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-accent block">
                Billetes en Mano
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                {label} ({currency})
              </h2>
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
          {/* Stock Actual registrado */}
          <div className="p-4 rounded-2xl bg-surface-2/40 border border-border/40 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-400">Billetes actuales registrados:</span>
            <span className="text-base sm:text-lg font-bold text-gray-200">
              {symbol} {formatCurrency(currentStock.amount, currency === 'ARS' ? 0 : 2)}
            </span>
          </div>

          {/* Gran Campo de Cantidad de Billetes */}
          <div className="space-y-2">
            <label className="text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-300 flex items-center justify-between">
              <span>Nueva Cantidad de Billetes en Caja:</span>
              <span className="text-accent font-semibold normal-case text-xs">
                {currency}
              </span>
            </label>
            <div className="relative flex items-center bg-surface-0 border-2 border-accent/40 focus-within:border-accent rounded-2xl px-4 py-3 shadow-inner transition-colors">
              <span className="text-xl sm:text-2xl font-black text-accent mr-2 select-none">
                {symbol}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={amountStr}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="w-full bg-transparent text-2xl sm:text-3xl font-black text-white outline-none tracking-tight"
                placeholder="0"
                autoFocus
              />
              {currentNumericAmount > 0 && (
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
                <span className="text-gray-400">La cantidad se mantendrá igual</span>
              ) : diff > 0 ? (
                <span className="text-profit font-bold">
                  Aumenta en: +{symbol} {formatThousandsInput(diff)}
                </span>
              ) : (
                <span className="text-loss font-bold">
                  Disminuye en: {symbol} {formatThousandsInput(diff)}
                </span>
              )}
            </div>
          </div>

          {/* Botones de Ajuste Rápido */}
          <div className="space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400 block">
              Sumar rápido billetes con un toque:
            </span>
            <div className="grid grid-cols-4 gap-2">
              {quickSteps.map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => handleAddAmount(step)}
                  className="py-2.5 px-1 bg-surface-2 hover:bg-surface-3 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl border border-white/5 transition-all text-center"
                >
                  +{formatThousandsInput(step)}
                </button>
              ))}
            </div>
          </div>

          {/* Precio Promedio de Compra (PPP) - Simplificado */}
          <div className="p-4 rounded-2xl bg-surface-2/30 border border-border/40 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-gray-300">
                Precio de compra promedio (Gs.):
              </label>
              <span className="text-[11px] text-gray-400">Costo por cada billete</span>
            </div>
            <div className="relative flex items-center bg-surface-0 border border-border focus-within:border-accent rounded-xl px-3 py-2">
              <span className="text-sm font-bold text-gray-400 mr-2">Gs.</span>
              <input
                type="text"
                inputMode="numeric"
                value={pppStr}
                onChange={(e) => handlePppChange(e.target.value)}
                className="w-full bg-transparent text-base font-bold text-white outline-none"
                placeholder="0"
              />
            </div>
            <p className="text-[11px] text-gray-500">
              Se utiliza para calcular automáticamente tu ganancia neta cuando vendas estos billetes.
            </p>
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
                <span>¡Guardado con Éxito!</span>
              </>
            ) : isSaving ? (
              <span>Guardando...</span>
            ) : (
              <>
                <Check className="w-5 h-5 text-surface-0 stroke-[3]" />
                <span>Guardar Billetes de {currency}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
