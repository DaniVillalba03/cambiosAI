'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Ventana: en el celular sube desde abajo, en la computadora aparece centrada. */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 animate-fade-in sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={cn(
          'bg-card w-full rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92dvh] animate-sheet',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 sm:px-6 pt-5 pb-4">
          {icon}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-ink leading-tight">{title}</h2>
            {subtitle && <p className="text-[15px] text-ink-3 mt-1">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-1 p-2.5 rounded-full text-ink-3 hover:bg-fill hover:text-ink"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 pb-5">{children}</div>
        {footer && (
          <div className="px-5 sm:px-6 py-4 border-t border-line flex gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl px-5 min-h-12 text-base font-semibold transition-colors disabled:opacity-50',
        variant === 'primary' && 'bg-brand text-white hover:bg-brand-hover',
        variant === 'secondary' && 'bg-card text-ink border border-line-strong hover:bg-fill',
        variant === 'danger' && 'bg-neg text-white hover:bg-neg/90',
        variant === 'ghost' && 'text-ink-2 hover:bg-fill',
        className
      )}
    />
  );
}

/** Título de sección con texto opcional a la derecha. */
export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3 px-1">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {action}
    </div>
  );
}

/** Campo grande para montos con prefijo (Gs., US$, …). */
export function AmountField({
  prefix,
  value,
  onChange,
  autoFocus,
  size = 'lg',
  label,
}: {
  prefix: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  size?: 'lg' | 'md';
  label?: string;
}) {
  return (
    <label className="block">
      {label && <span className="block text-[15px] text-ink-2 mb-1.5">{label}</span>}
      <span
        className={cn(
          'flex items-center rounded-xl border-2 border-line-strong bg-card focus-within:border-brand transition-colors',
          size === 'lg' ? 'px-4 py-3' : 'px-3 py-2'
        )}
      >
        <span className={cn('text-ink-3 mr-2 shrink-0', size === 'lg' ? 'text-xl' : 'text-base')}>{prefix}</span>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          className={cn(
            'money w-full min-w-0 bg-transparent outline-none text-ink',
            size === 'lg' ? 'text-3xl' : 'text-lg'
          )}
        />
      </span>
    </label>
  );
}
