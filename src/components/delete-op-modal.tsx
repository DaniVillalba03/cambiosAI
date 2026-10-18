'use client';

import React, { useState } from 'react';
import { AlertTriangle, Trash2, X, ArrowDownCircle, ArrowUpCircle, Receipt } from 'lucide-react';
import { Operation, CURRENCY_FLAGS, CURRENCY_SYMBOLS } from '@/types';
import { formatPYG, formatCurrency, cn } from '@/lib/utils';
import { BankPill } from './bank-logo';

interface DeleteOpModalProps {
  operation: Operation | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (id: string) => void;
}

export function DeleteOpModal({ operation, isOpen, onClose, onConfirm }: DeleteOpModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen || !operation) return null;

  const handleConfirm = () => {
    setIsDeleting(true);
    onConfirm(operation.id);
    setTimeout(() => {
      setIsDeleting(false);
      onClose();
    }, 200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="w-full max-w-md bg-[#0F172A] border border-red-500/30 rounded-3xl p-6 shadow-2xl shadow-red-500/10 text-white relative animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Warning Icon & Title */}
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-red-500/10 text-red-400 rounded-2xl border border-red-500/20">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">
              ¿Eliminar Operación #{operation.operationNumber}?
            </h3>
            <p className="text-xs text-gray-400">Esta acción revertirá los saldos y el stock.</p>
          </div>
        </div>

        {/* Operation Details Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-3 mb-5">
          <div className="flex items-center justify-between">
            <span
              className={cn(
                'text-xs font-bold px-2.5 py-1 rounded-lg uppercase tracking-wider',
                operation.type === 'COMPRA' && 'bg-buy/20 text-buy border border-buy/30',
                operation.type === 'VENTA' && 'bg-sell/20 text-sell border border-sell/30',
                operation.type === 'GASTO' && 'bg-expense/20 text-expense border border-expense/30'
              )}
            >
              {operation.type === 'COMPRA' ? '🔵 Compra' : operation.type === 'VENTA' ? '🟡 Venta' : '🔴 Gasto / Pago'}
            </span>
            <BankPill account={operation.account} size="xs" />
          </div>

          <div className="flex items-baseline justify-between pt-1">
            {operation.amount && operation.currency ? (
              <span className="text-sm font-semibold text-gray-200">
                {CURRENCY_FLAGS[operation.currency]} {CURRENCY_SYMBOLS[operation.currency]} {formatCurrency(operation.amount)} @ {formatCurrency(operation.rate || 0, 0)}
              </span>
            ) : (
              <span className="text-sm font-semibold text-gray-200 truncate max-w-[200px]">
                {operation.description || 'Gasto'}
              </span>
            )}
            <span className="text-base font-extrabold text-white">
              {formatPYG(operation.totalPYG)}
            </span>
          </div>

          {operation.description && (
            <p className="text-xs text-gray-400 italic bg-black/30 p-2 rounded-lg border border-white/5">
              "{operation.description}"
            </p>
          )}
        </div>

        {/* Explanation text */}
        <div className="text-xs text-red-300/90 bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-6 space-y-1">
          <p className="font-semibold">⚠️ ¿Qué pasará al confirmar?</p>
          <ul className="list-disc list-inside text-gray-300 space-y-0.5 pl-1">
            <li>Se recalculará y revertirá el saldo de <strong>{operation.account}</strong>.</li>
            {operation.currency && (
              <li>Se devolverá el stock de <strong>{operation.currency}</strong> a su estado anterior.</li>
            )}
            <li>Se actualizará en tiempo real en la base de datos de Supabase.</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-gray-300 text-sm font-semibold transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-sm font-bold shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? 'Eliminando...' : 'Sí, Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
}
