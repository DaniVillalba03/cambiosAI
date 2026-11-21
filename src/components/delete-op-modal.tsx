'use client';

import { useState, useEffect } from 'react';
import { Operation } from '@/types';
import { formatPYG, formatTime } from '@/lib/utils';
import { Modal, Button } from './ui';
import { describeOperation } from './dashboard';

interface DeleteOpModalProps {
  operation: Operation | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (id: string) => Promise<boolean> | void;
}

export function DeleteOpModal({ operation, isOpen, onClose, onConfirm }: DeleteOpModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDeleting(false);
      setError(false);
    }
  }, [isOpen]);

  if (!operation) return null;

  const confirm = async () => {
    setDeleting(true);
    const ok = await onConfirm(operation.id);
    setDeleting(false);
    if (ok === false) setError(true);
    else onClose();
  };

  const account = operation.account === 'Efectivo PYG' ? 'Efectivo' : operation.account;

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="¿Borrar este movimiento?"
      subtitle="Los saldos vuelven a como estaban antes."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="flex-1">
            No, dejarlo
          </Button>
          <Button variant="danger" onClick={confirm} disabled={deleting} className="flex-1">
            {deleting ? 'Borrando…' : 'Sí, borrar'}
          </Button>
        </>
      }
    >
      <div className="rounded-xl bg-fill px-4 py-3.5">
        <p className="text-base text-ink">{describeOperation(operation)}</p>
        <p className="text-[15px] text-ink-3 mt-1">
          {formatTime(operation.timestamp)} · {account} ·{' '}
          <span className="money text-ink">{formatPYG(operation.totalPYG)}</span>
        </p>
      </div>
      {error && (
        <p className="text-[15px] text-neg mt-3">No se pudo borrar. Revisá la conexión e intentá de nuevo.</p>
      )}
    </Modal>
  );
}
