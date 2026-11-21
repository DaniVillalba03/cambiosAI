'use client';

import { useState, useEffect } from 'react';
import { Currency, CURRENCY_SYMBOLS, CurrencyStock } from '@/types';
import { formatCurrency, parseNumberString, formatThousandsInput } from '@/lib/utils';
import { Modal, Button, AmountField } from './ui';

const PLURAL: Record<Currency, string> = {
  USD: 'Dólares',
  BRL: 'Reales',
  ARS: 'Pesos argentinos',
  EUR: 'Euros',
};

interface EditCurrencyModalProps {
  currency: Currency | null;
  currentStock: CurrencyStock | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (currency: Currency, amount: number, averageCost?: number) => Promise<boolean | void>;
}

export function EditCurrencyModal({ currency, currentStock, isOpen, onClose, onSave }: EditCurrencyModalProps) {
  const [amount, setAmount] = useState('0');
  const [cost, setCost] = useState('0');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && currentStock) {
      setAmount(formatThousandsInput(currentStock.amount));
      setCost(formatThousandsInput(Math.round(currentStock.averageCost || 0)));
      setSaving(false);
    }
  }, [isOpen, currentStock]);

  if (!currency || !currentStock) return null;

  const save = async () => {
    setSaving(true);
    try {
      await onSave(currency, parseNumberString(amount), parseNumberString(cost));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={PLURAL[currency]}
      subtitle="Cantidad de billetes que hay en caja"
      icon={
        <span className="w-10 h-10 rounded-xl bg-fill flex items-center justify-center text-[13px] font-bold text-ink-2 shrink-0">
          {currency}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1 sm:flex-none">
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving} className="flex-1">
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <p className="text-[15px] text-ink-3 mb-4">
        Anotado ahora:{' '}
        <span className="money text-ink font-semibold">
          {CURRENCY_SYMBOLS[currency]} {formatCurrency(currentStock.amount, currency === 'ARS' ? 0 : 2)}
        </span>
      </p>

      <div className="space-y-5">
        <AmountField
          label="Cantidad en caja"
          prefix={CURRENCY_SYMBOLS[currency]}
          value={amount}
          onChange={(v) => setAmount(formatThousandsInput(parseNumberString(v)))}
          autoFocus
        />
        <div>
          <AmountField
            label="¿A cuánto los compraste en promedio?"
            prefix="Gs."
            size="md"
            value={cost}
            onChange={(v) => setCost(formatThousandsInput(parseNumberString(v)))}
          />
          <p className="text-sm text-ink-3 mt-2">Con este precio se calcula la ganancia cuando vendés.</p>
        </div>
      </div>
    </Modal>
  );
}
