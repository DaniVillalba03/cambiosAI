'use client';

import { useState, useEffect } from 'react';
import { useAppState } from '@/store/app-context';
import { Account, Currency, CURRENCIES, CURRENCY_SYMBOLS, BANK_ACCOUNTS, CurrencyStock } from '@/types';
import { formatPYG, parseNumberString, formatThousandsInput } from '@/lib/utils';
import { BankLogo } from '@/components/bank-logo';
import { Modal, Button } from './ui';

const PLURAL: Record<Currency, string> = {
  USD: 'Dólares',
  BRL: 'Reales',
  ARS: 'Pesos argentinos',
  EUR: 'Euros',
};

interface AdjustCashModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function SmallField({ prefix, value, onChange, label }: { prefix: string; value: number; onChange: (n: number) => void; label: string }) {
  return (
    <label className="flex items-center rounded-xl border border-line-strong bg-card focus-within:border-brand px-3 h-12">
      <span className="text-ink-3 mr-2 text-[15px] shrink-0">{prefix}</span>
      <input
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={formatThousandsInput(value)}
        onChange={(e) => onChange(parseNumberString(e.target.value))}
        className="money w-full min-w-0 bg-transparent outline-none text-lg text-ink text-right"
      />
    </label>
  );
}

/**
 * Ajustar todos los saldos de una vez (por ejemplo al empezar el día).
 * Nota: se quitaron "Restaurar demo" y "Vaciar operaciones": cargaban datos falsos
 * o borraban TODO el historial con un solo toque.
 */
export function AdjustCashModal({ isOpen, onClose }: AdjustCashModalProps) {
  const { state, updateInitialBalances } = useAppState();
  const accounts: Account[] = ['Efectivo PYG', ...BANK_ACCOUNTS];

  const [balances, setBalances] = useState<Record<Account, number>>({ ...state.accountBalances });
  const [stocks, setStocks] = useState<Record<Currency, { amount: number; averageCost: number }>>(
    {} as Record<Currency, { amount: number; averageCost: number }>
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setBalances({ ...state.accountBalances });
    const init = {} as Record<Currency, { amount: number; averageCost: number }>;
    CURRENCIES.forEach((c) => {
      init[c] = { amount: state.currencyStocks[c]?.amount || 0, averageCost: Math.round(state.currencyStocks[c]?.averageCost || 0) };
    });
    setStocks(init);
    setSaving(false);
    // Solo al abrir: no pisar lo que se está escribiendo si llega un cambio en vivo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const total = accounts.reduce((s, a) => s + (balances[a] || 0), 0);

  const save = async () => {
    setSaving(true);
    const formatted = {} as Record<Currency, CurrencyStock>;
    CURRENCIES.forEach((c) => {
      const s = stocks[c] || { amount: 0, averageCost: 0 };
      formatted[c] = { currency: c, amount: s.amount, averageCost: s.averageCost, totalCostPYG: s.amount * s.averageCost };
    });
    await updateInitialBalances(balances, formatted);
    setSaving(false);
    onClose();
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      wide
      title="Ajustar todos los saldos"
      subtitle="Poné lo que hay de verdad en cada lugar"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1 sm:flex-none">
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving} className="flex-1">
            {saving ? 'Guardando…' : 'Guardar todo'}
          </Button>
        </>
      }
    >
      <h3 className="text-base font-semibold text-ink mb-2">Guaraníes</h3>
      <div className="divide-y divide-line border-y border-line">
        {accounts.map((acc) => (
          <div key={acc} className="flex items-center gap-3 py-3">
            <BankLogo account={acc} size="sm" />
            <span className="flex-1 min-w-0 text-base text-ink truncate">{acc === 'Efectivo PYG' ? 'Efectivo' : acc}</span>
            <div className="w-44 sm:w-56 shrink-0">
              <SmallField
                label={acc}
                prefix="Gs."
                value={balances[acc] || 0}
                onChange={(n) => setBalances((p) => ({ ...p, [acc]: n }))}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[15px] text-ink-3 mt-3 text-right">
        Total: <span className="money text-ink font-semibold">{formatPYG(total)}</span>
      </p>

      <h3 className="text-base font-semibold text-ink mt-7 mb-2">Billetes en caja</h3>
      <div className="divide-y divide-line border-y border-line">
        {CURRENCIES.map((cur) => (
          <div key={cur} className="py-3">
            <p className="text-base text-ink mb-2">{PLURAL[cur]}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-sm text-ink-3 mb-1">Cantidad</span>
                <SmallField
                  label={`Cantidad de ${PLURAL[cur]}`}
                  prefix={CURRENCY_SYMBOLS[cur]}
                  value={stocks[cur]?.amount || 0}
                  onChange={(n) => setStocks((p) => ({ ...p, [cur]: { ...p[cur], amount: n } }))}
                />
              </div>
              <div>
                <span className="block text-sm text-ink-3 mb-1">Costo promedio</span>
                <SmallField
                  label={`Costo promedio de ${PLURAL[cur]}`}
                  prefix="Gs."
                  value={stocks[cur]?.averageCost || 0}
                  onChange={(n) => setStocks((p) => ({ ...p, [cur]: { ...p[cur], averageCost: n } }))}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
