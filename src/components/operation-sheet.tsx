'use client';

import { useEffect, useState } from 'react';
import { Account, BANK_ACCOUNTS, CURRENCIES, CURRENCY_SYMBOLS, Currency, Operation, OperationType } from '@/types';
import { formatPYG, formatCurrency, formatTime, parseNumberString, formatThousandsInput, cn } from '@/lib/utils';
import { useAppState } from '@/store/app-context';
import { Modal, Button } from './ui';
import { describeOperation, CURRENCY_PLURAL, signed } from './dashboard';

const ACCOUNTS: Account[] = ['Efectivo PYG', ...BANK_ACCOUNTS];
const accName = (a?: string) => (a === 'Efectivo PYG' ? 'Efectivo' : a || '');

const TYPE_LABEL: Record<OperationType, string> = {
  COMPRA: 'Compra de divisas',
  VENTA: 'Venta de divisas',
  GASTO: 'Gasto (salió plata)',
  INGRESO: 'Ingreso (entró plata)',
  TRANSFERENCIA: 'Pase entre cuentas',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[15px] text-ink-2 mb-1.5">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  'w-full h-12 rounded-xl border border-line-strong bg-card px-3 text-base text-ink outline-none focus:border-brand';

function NumberInput({ prefix, value, onChange, decimals = false }: { prefix: string; value: string; onChange: (v: string) => void; decimals?: boolean }) {
  return (
    <span className="flex items-center h-12 rounded-xl border border-line-strong bg-card px-3 focus-within:border-brand">
      <span className="text-ink-3 mr-2 shrink-0">{prefix}</span>
      <input
        type="text"
        inputMode={decimals ? 'decimal' : 'numeric'}
        value={value}
        onChange={(e) => onChange(decimals ? e.target.value.replace(/[^\d.,]/g, '') : formatThousandsInput(parseNumberString(e.target.value)))}
        className="money w-full min-w-0 bg-transparent outline-none text-lg text-ink"
      />
    </span>
  );
}

/** Ficha de un movimiento: ver detalle, corregir o borrar. */
export function OperationSheet({ operation, onClose }: { operation: Operation | null; onClose: () => void }) {
  const { deleteOperation, updateOperation } = useAppState();
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Campos editables
  const [type, setType] = useState<OperationType>('GASTO');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [total, setTotal] = useState('');
  const [account, setAccount] = useState<Account>('Efectivo PYG');
  const [toAccount, setToAccount] = useState<Account>('Itaú');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (!operation) return;
    setMode('view');
    setBusy(false);
    setError(null);
    setType(operation.type);
    setCurrency(operation.currency || 'USD');
    setAmount(operation.amount ? String(operation.amount).replace('.', ',') : '');
    setRate(operation.rate ? String(operation.rate).replace('.', ',') : '');
    setTotal(formatThousandsInput(operation.totalPYG));
    setAccount(operation.account);
    setToAccount(operation.toAccount || (operation.account === 'Efectivo PYG' ? 'Itaú' : 'Efectivo PYG'));
    setDescription(operation.description || '');
  }, [operation]);

  if (!operation) return null;
  const isFx = type === 'COMPRA' || type === 'VENTA';
  const num = (v: string) => Number(v.replace(/\./g, '').replace(',', '.')) || 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    const err = await updateOperation(operation.id, {
      type,
      currency: isFx ? currency : undefined,
      amount: isFx ? num(amount) : undefined,
      rate: isFx ? num(rate) : undefined,
      totalPYG: isFx ? Math.round(num(amount) * num(rate)) : parseNumberString(total),
      account,
      toAccount: type === 'TRANSFERENCIA' ? toAccount : undefined,
      description: description.trim() || undefined,
    });
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    const ok = await deleteOperation(operation.id);
    setBusy(false);
    if (ok) onClose();
    else setError('No se pudo borrar. Revisá la conexión e intentá de nuevo.');
  };

  const footer =
    mode === 'view' ? (
      <>
        <Button variant="secondary" onClick={() => setMode('delete')} className="flex-1 !text-neg">
          Borrar
        </Button>
        <Button onClick={() => setMode('edit')} className="flex-1">
          Corregir
        </Button>
      </>
    ) : mode === 'edit' ? (
      <>
        <Button variant="secondary" onClick={() => setMode('view')} className="flex-1 sm:flex-none">
          Volver
        </Button>
        <Button onClick={save} disabled={busy} className="flex-1">
          {busy ? 'Guardando…' : 'Guardar'}
        </Button>
      </>
    ) : (
      <>
        <Button variant="secondary" onClick={() => setMode('view')} className="flex-1">
          No, dejarlo
        </Button>
        <Button variant="danger" onClick={remove} disabled={busy} className="flex-1">
          {busy ? 'Borrando…' : 'Sí, borrar'}
        </Button>
      </>
    );

  return (
    <Modal
      open={!!operation}
      onClose={onClose}
      title={mode === 'edit' ? 'Corregir movimiento' : mode === 'delete' ? '¿Borrar este movimiento?' : describeOperation(operation)}
      subtitle={mode === 'delete' ? 'Los saldos vuelven a como estaban antes.' : undefined}
      footer={footer}
    >
      {mode !== 'edit' ? (
        <dl className="divide-y divide-line border-y border-line text-base">
          {[
            ['Tipo', TYPE_LABEL[operation.type]],
            ['Monto', formatPYG(operation.totalPYG)],
            ...(operation.type === 'TRANSFERENCIA'
              ? [['De', accName(operation.account)], ['A', accName(operation.toAccount)]]
              : [['Cuenta', accName(operation.account)]]),
            ...(operation.profit !== undefined ? [['Ganancia', signed(operation.profit)]] : []),
            ...(operation.description ? [['Detalle', operation.description]] : []),
            ['Hora', `${formatTime(operation.timestamp)} · N.º ${operation.operationNumber}`],
            ['Lo anotó', operation.registeredBy || (operation.source === 'web' ? 'Web' : 'WhatsApp')],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-3">
              <dt className="text-ink-3 shrink-0">{k}</dt>
              <dd className="text-ink text-right break-words min-w-0">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className="space-y-4">
          <Field label="Tipo">
            <select value={type} onChange={(e) => setType(e.target.value as OperationType)} className={inputCls}>
              {(Object.keys(TYPE_LABEL) as OperationType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>

          {isFx ? (
            <>
              <Field label="Moneda">
                <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={inputCls}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {CURRENCY_PLURAL[c]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cantidad">
                  <NumberInput prefix={CURRENCY_SYMBOLS[currency]} value={amount} onChange={setAmount} decimals />
                </Field>
                <Field label="Cotización">
                  <NumberInput prefix="Gs." value={rate} onChange={setRate} decimals />
                </Field>
              </div>
              <p className="text-[15px] text-ink-3">
                Total: <span className="money text-ink">{formatPYG(Math.round(num(amount) * num(rate)))}</span>
              </p>
            </>
          ) : (
            <Field label="Monto">
              <NumberInput prefix="Gs." value={total} onChange={setTotal} />
            </Field>
          )}

          <Field label={type === 'TRANSFERENCIA' ? 'Sale de' : isFx ? 'Cuenta en guaraníes' : 'Cuenta'}>
            <select value={account} onChange={(e) => setAccount(e.target.value as Account)} className={inputCls}>
              {ACCOUNTS.map((a) => (
                <option key={a} value={a}>
                  {accName(a)}
                </option>
              ))}
            </select>
          </Field>

          {type === 'TRANSFERENCIA' && (
            <Field label="Entra a">
              <select value={toAccount} onChange={(e) => setToAccount(e.target.value as Account)} className={inputCls}>
                {ACCOUNTS.filter((a) => a !== account).map((a) => (
                  <option key={a} value={a}>
                    {accName(a)}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Detalle (opcional)">
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={inputCls} />
          </Field>
        </div>
      )}

      {mode === 'delete' && (
        <p className="text-[15px] text-ink-2 mt-4">
          {operation.type === 'VENTA' || operation.type === 'COMPRA'
            ? `También se ajustan los billetes de ${CURRENCY_PLURAL[operation.currency || 'USD'].toLowerCase()}.`
            : null}
        </p>
      )}
      {error && <p className={cn('text-[15px] text-neg mt-4')}>{error}</p>}
      {mode === 'view' && operation.currency && operation.amount ? (
        <p className="text-sm text-ink-3 mt-3">
          {CURRENCY_SYMBOLS[operation.currency]} {formatCurrency(operation.amount)} a {formatCurrency(operation.rate || 0, 0)}
        </p>
      ) : null}
    </Modal>
  );
}
