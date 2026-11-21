'use client';

import { useState, useEffect } from 'react';
import { Account } from '@/types';
import { formatPYG, parseNumberString, formatThousandsInput, cn } from '@/lib/utils';
import { BankLogo } from '@/components/bank-logo';
import { Modal, Button, AmountField } from './ui';

interface EditAccountModalProps {
  account: Account | null;
  currentBalance: number;
  isOpen: boolean;
  onClose: () => void;
  onSave: (account: Account, newBalance: number) => Promise<boolean | void>;
}

export function EditAccountModal({ account, currentBalance, isOpen, onClose, onSave }: EditAccountModalProps) {
  const [value, setValue] = useState('0');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setValue(formatThousandsInput(currentBalance));
      setSaving(false);
    }
  }, [isOpen, currentBalance]);

  if (!account) return null;

  const next = parseNumberString(value);
  const diff = next - currentBalance;
  const name = account === 'Efectivo PYG' ? 'Efectivo' : account;

  const save = async () => {
    setSaving(true);
    try {
      await onSave(account, next);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={name}
      subtitle="Corregí el saldo si no coincide con el real"
      icon={<BankLogo account={account} size="md" />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1 sm:flex-none">
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || diff === 0} className="flex-1">
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <p className="text-[15px] text-ink-3 mb-4">
        Saldo anotado ahora: <span className="money text-ink font-semibold">{formatPYG(currentBalance)}</span>
      </p>

      <AmountField
        label="Saldo correcto"
        prefix="Gs."
        value={value}
        onChange={(v) => setValue(formatThousandsInput(parseNumberString(v)))}
        autoFocus
      />

      <p className={cn('text-[15px] mt-3 min-h-6', diff > 0 ? 'text-pos' : diff < 0 ? 'text-neg' : 'text-ink-3')}>
        {diff === 0 ? 'Sin cambios' : `${diff > 0 ? 'Suma' : 'Resta'} ${formatPYG(Math.abs(diff))}`}
      </p>
    </Modal>
  );
}
