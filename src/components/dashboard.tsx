'use client';

import { useState, useMemo } from 'react';
import { ChevronRight, ArrowDownLeft, ArrowUpRight, Receipt, Trash2, PencilLine, SlidersHorizontal } from 'lucide-react';
import { useAppState } from '@/store/app-context';
import { formatPYG, formatCurrency, formatTime, toLocalISODate, isSameDay, cn } from '@/lib/utils';
import {
  Account,
  Currency,
  CURRENCIES,
  CURRENCY_SYMBOLS,
  BANK_ACCOUNTS,
  OWNER_NAME,
  Operation,
} from '@/types';
import { AdjustCashModal } from './adjust-cash-modal';
import { EditAccountModal } from './edit-account-modal';
import { EditCurrencyModal } from './edit-currency-modal';
import { BankLogo } from './bank-logo';
import { DeleteOpModal } from './delete-op-modal';
import { DateSelector } from './date-selector';
import { SectionHeader } from './ui';
import type { Tab } from './app-shell';

export const CURRENCY_PLURAL: Record<Currency, string> = {
  USD: 'Dólares',
  BRL: 'Reales',
  ARS: 'Pesos argentinos',
  EUR: 'Euros',
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function signed(n: number) {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatPYG(Math.abs(n))}`;
}

/** Descripción en palabras de una operación. */
export function describeOperation(op: Operation): string {
  if (op.type === 'GASTO') return op.description ? `Gasto: ${op.description}` : 'Gasto';
  const qty =
    op.currency && op.amount
      ? `${CURRENCY_SYMBOLS[op.currency]} ${formatCurrency(op.amount, op.currency === 'ARS' ? 0 : 2)}`
      : '';
  const rate = op.rate ? ` a ${formatCurrency(op.rate, op.currency === 'ARS' ? 1 : 0)}` : '';
  return `${op.type === 'COMPRA' ? 'Compró' : 'Vendió'} ${qty}${rate}`;
}

export const OP_STYLE = {
  COMPRA: { icon: ArrowDownLeft, cls: 'bg-[#e6eef8] text-[#2b5c9e]' },
  VENTA: { icon: ArrowUpRight, cls: 'bg-brand-soft text-brand' },
  GASTO: { icon: Receipt, cls: 'bg-warn-soft text-warn' },
} as const;

function Row({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 sm:px-5 py-4 text-left hover:bg-fill/60 transition-colors"
    >
      {children}
    </button>
  );
}

export function Dashboard({ onNavigate }: { onNavigate?: (tab: Tab) => void }) {
  const { state, deleteOperation, updateSingleAccountBalance, updateSingleCurrencyStock } = useAppState();

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<Account | null>(null);
  const [currencyToEdit, setCurrencyToEdit] = useState<Currency | null>(null);
  const [opToDelete, setOpToDelete] = useState<Operation | null>(null);

  const todayStr = useMemo(() => toLocalISODate(new Date()), []);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  const todayOps = useMemo(
    () => state.operations.filter((op) => isSameDay(op.timestamp, todayStr)),
    [state.operations, todayStr]
  );
  const dayOps = useMemo(
    () => state.operations.filter((op) => isSameDay(op.timestamp, selectedDate)).reverse(),
    [state.operations, selectedDate]
  );

  const todayProfit = todayOps.reduce((s, o) => s + (o.profit || 0), 0);
  const todayExpenses = todayOps.filter((o) => o.type === 'GASTO').reduce((s, o) => s + o.totalPYG, 0);

  const pygAccounts: Account[] = ['Efectivo PYG', ...BANK_ACCOUNTS];
  const totalPYG = pygAccounts.reduce((s, a) => s + (state.accountBalances[a] || 0), 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10 space-y-8 lg:space-y-10">
        {/* ─── Saludo ─── */}
        <header className="px-1">
          <h1 className="font-serif text-3xl lg:text-4xl font-semibold text-ink">
            {greeting()}, {OWNER_NAME}
          </h1>
          <p className="text-ink-3 mt-1 first-letter:uppercase">
            {new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </header>

        {/* ─── Total ─── */}
        <section className="card p-5 sm:p-7">
          <p className="text-ink-2">Plata en guaraníes</p>
          <p className="money text-[40px] sm:text-5xl font-semibold text-ink mt-1 leading-tight break-words">
            {formatPYG(totalPYG)}
          </p>
          <p className="text-[15px] text-ink-3 mt-1">Efectivo y {BANK_ACCOUNTS.length} bancos</p>

          <div className="mt-6 pt-5 border-t border-line grid grid-cols-2 gap-4">
            <div>
              <p className="text-[15px] text-ink-3">Ganancia de hoy</p>
              <p className={cn('money text-2xl font-semibold mt-0.5', todayProfit < 0 ? 'text-neg' : 'text-pos')}>
                {signed(todayProfit)}
              </p>
            </div>
            <div>
              <p className="text-[15px] text-ink-3">Gastos de hoy</p>
              <p className="money text-2xl font-semibold mt-0.5 text-ink">{formatPYG(todayExpenses)}</p>
            </div>
          </div>

          {onNavigate && (
            <button
              type="button"
              onClick={() => onNavigate('anotar')}
              className="mt-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-hover text-white font-semibold text-base h-12 px-6"
            >
              <PencilLine className="w-5 h-5" />
              Anotar una operación
            </button>
          )}
        </section>

        <div className="grid xl:grid-cols-2 gap-8 items-start">
          {/* ─── Cuentas ─── */}
          <section>
            <SectionHeader
              title="Cuentas"
              action={
                <button
                  type="button"
                  onClick={() => setAdjustOpen(true)}
                  className="inline-flex items-center gap-1.5 text-[15px] font-medium text-brand px-2 py-1.5 rounded-lg hover:bg-brand-soft"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Ajustar todo
                </button>
              }
            />
            <div className="card divide-y divide-line overflow-hidden">
              {pygAccounts.map((acc) => {
                const bal = state.accountBalances[acc] || 0;
                return (
                  <Row key={acc} onClick={() => setAccountToEdit(acc)}>
                    <BankLogo account={acc} size="md" />
                    <span className="flex-1 min-w-0 text-base text-ink truncate">
                      {acc === 'Efectivo PYG' ? 'Efectivo' : acc}
                    </span>
                    <span className={cn('money text-lg font-semibold whitespace-nowrap', bal < 0 ? 'text-neg' : 'text-ink')}>
                      {formatPYG(bal)}
                    </span>
                    <ChevronRight className="w-5 h-5 text-ink-3 shrink-0 -mr-1" />
                  </Row>
                );
              })}
            </div>
          </section>

          {/* ─── Billetes ─── */}
          <section>
            <SectionHeader title="Billetes en caja" />
            <div className="card divide-y divide-line overflow-hidden">
              {CURRENCIES.map((cur) => {
                const s = state.currencyStocks[cur];
                const empty = s.amount <= 0;
                return (
                  <Row key={cur} onClick={() => setCurrencyToEdit(cur)}>
                    <span className="w-10 h-10 rounded-xl bg-fill flex items-center justify-center text-[13px] font-bold text-ink-2 shrink-0">
                      {cur}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-base text-ink">{CURRENCY_PLURAL[cur]}</span>
                      {s.averageCost > 0 && (
                        <span className="block text-sm text-ink-3 tabular">
                          Costo promedio Gs. {formatCurrency(s.averageCost, cur === 'ARS' ? 1 : 0)}
                        </span>
                      )}
                    </span>
                    <span className={cn('money text-lg font-semibold whitespace-nowrap', empty ? 'text-ink-3' : 'text-ink')}>
                      {CURRENCY_SYMBOLS[cur]} {formatCurrency(s.amount, cur === 'ARS' ? 0 : 2)}
                    </span>
                    <ChevronRight className="w-5 h-5 text-ink-3 shrink-0 -mr-1" />
                  </Row>
                );
              })}
            </div>
          </section>
        </div>

        {/* ─── Movimientos ─── */}
        <section className="pb-6">
          <SectionHeader title="Movimientos" />
          <div className="card overflow-hidden">
            <div className="px-2 sm:px-3 py-2 border-b border-line">
              <DateSelector selectedDate={selectedDate} onSelectDate={setSelectedDate} />
            </div>

            {dayOps.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-base text-ink-2">No hay movimientos este día.</p>
                {selectedDate === todayStr && (
                  <p className="text-[15px] text-ink-3 mt-1">Mandá un mensaje por WhatsApp o usá “Anotar”.</p>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {dayOps.map((op) => {
                  const st = OP_STYLE[op.type];
                  const Icon = st.icon;
                  return (
                    <li key={op.id} className="flex items-start gap-3 sm:gap-4 pl-4 sm:pl-5 pr-2 py-4">
                      <span className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0', st.cls)}>
                        <Icon className="w-5 h-5" />
                      </span>
                      {/* En el celular: descripción arriba y monto abajo; en pantallas grandes, monto a la derecha */}
                      <div className="flex-1 min-w-0 sm:flex sm:items-center sm:gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-base text-ink leading-snug break-words">{describeOperation(op)}</p>
                          <p className="text-sm text-ink-3 mt-0.5">
                            {formatTime(op.timestamp)} · {op.account === 'Efectivo PYG' ? 'Efectivo' : op.account}
                          </p>
                        </div>
                        <div className="mt-1.5 sm:mt-0 sm:text-right shrink-0 flex sm:block items-baseline gap-3">
                          <p className="money text-lg font-semibold text-ink whitespace-nowrap">
                            {op.type === 'VENTA' ? '+' : '−'}
                            {formatPYG(op.totalPYG)}
                          </p>
                          {op.profit !== undefined && (
                            <p className={cn('text-sm whitespace-nowrap', op.profit >= 0 ? 'text-pos' : 'text-neg')}>
                              ganó {signed(op.profit)}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpToDelete(op)}
                        className="w-11 h-11 -my-0.5 shrink-0 rounded-full flex items-center justify-center text-ink-3 hover:text-neg hover:bg-neg-soft"
                        aria-label={`Borrar operación ${op.operationNumber}`}
                        title="Borrar"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <EditAccountModal
        account={accountToEdit}
        currentBalance={accountToEdit ? state.accountBalances[accountToEdit] || 0 : 0}
        isOpen={!!accountToEdit}
        onClose={() => setAccountToEdit(null)}
        onSave={async (account, value) => {
          await updateSingleAccountBalance(account, value);
        }}
      />
      <EditCurrencyModal
        currency={currencyToEdit}
        currentStock={currencyToEdit ? state.currencyStocks[currencyToEdit] || null : null}
        isOpen={!!currencyToEdit}
        onClose={() => setCurrencyToEdit(null)}
        onSave={async (currency, amount, avg) => {
          await updateSingleCurrencyStock(currency, amount, avg);
        }}
      />
      <AdjustCashModal isOpen={adjustOpen} onClose={() => setAdjustOpen(false)} />
      <DeleteOpModal
        operation={opToDelete}
        isOpen={!!opToDelete}
        onClose={() => setOpToDelete(null)}
        onConfirm={(id) => deleteOperation(id)}
      />
    </div>
  );
}
