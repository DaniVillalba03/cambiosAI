'use client';

import { useState, useMemo } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Trash2,
  SlidersHorizontal,
  Pencil,
  MessageSquarePlus,
} from 'lucide-react';
import { useAppState } from '@/store/app-context';
import {
  formatPYG,
  formatCurrency,
  formatTime,
  toLocalISODate,
  isSameDay,
  formatDisplayDate,
  cn,
} from '@/lib/utils';
import {
  Account,
  Currency,
  CURRENCIES,
  CURRENCY_LABELS,
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

const TYPE_META = {
  COMPRA: { label: 'Compra', icon: ArrowDownLeft, color: 'text-buy', bg: 'bg-buy/10' },
  VENTA: { label: 'Venta', icon: ArrowUpRight, color: 'text-sell', bg: 'bg-sell/10' },
  GASTO: { label: 'Gasto', icon: Receipt, color: 'text-expense', bg: 'bg-expense/10' },
} as const;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function signed(n: number) {
  return `${n > 0 ? '+' : ''}${formatPYG(n)}`;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'profit' | 'loss' | 'expense' }) {
  return (
    <div className="min-w-0">
      <p className="label">{label}</p>
      <p
        className={cn(
          'num mt-1 text-base sm:text-lg font-semibold truncate',
          tone === 'profit' && 'text-profit',
          tone === 'loss' && 'text-loss',
          tone === 'expense' && 'text-expense',
          !tone && 'text-white'
        )}
      >
        {value}
      </p>
    </div>
  );
}

function SectionTitle({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-3">
      <div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Dashboard({ onGoToChat }: { onGoToChat?: () => void }) {
  const { state, deleteOperation, updateSingleAccountBalance, updateSingleCurrencyStock } = useAppState();

  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<Account | null>(null);
  const [currencyToEdit, setCurrencyToEdit] = useState<Currency | null>(null);
  const [opToDelete, setOpToDelete] = useState<Operation | null>(null);

  const todayStr = useMemo(() => toLocalISODate(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const isSelectedToday = selectedDate === todayStr;

  const dateOperations = useMemo(
    () => state.operations.filter((op) => isSameDay(op.timestamp, selectedDate)),
    [state.operations, selectedDate]
  );

  const { profit, expenses, volume } = useMemo(() => {
    let p = 0,
      e = 0,
      v = 0;
    for (const op of dateOperations) {
      p += op.profit || 0;
      if (op.type === 'GASTO') e += op.totalPYG;
      else v += op.totalPYG;
    }
    return { profit: p, expenses: e, volume: v };
  }, [dateOperations]);
  const net = profit - expenses;

  const pygAccounts: Account[] = ['Efectivo PYG', ...BANK_ACCOUNTS];
  const totalPYG = pygAccounts.reduce((sum, a) => sum + (state.accountBalances[a] || 0), 0);
  const fxAtCost = CURRENCIES.reduce((sum, c) => sum + (state.currencyStocks[c]?.totalCostPYG || 0), 0);

  const dayLabel = isSelectedToday ? 'hoy' : formatDisplayDate(selectedDate).toLowerCase();

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 lg:px-8 py-5 lg:py-8 space-y-8">
        {/* ─── Encabezado ─── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted first-letter:uppercase">
              {new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="text-xl lg:text-2xl font-semibold text-white tracking-tight mt-0.5">
              Bienvenido, {OWNER_NAME} 👋
            </h1>
            <p className="text-sm text-muted mt-1">{greeting()}. Así están tu caja y tus bancos.</p>
          </div>
          <div className="flex items-center gap-2">
            {onGoToChat && (
              <button
                type="button"
                onClick={onGoToChat}
                className="lg:hidden inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-accent text-surface-0 text-sm font-semibold"
              >
                <MessageSquarePlus className="w-4 h-4" />
                Registrar
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsAdjustModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-border hover:border-border-bright bg-surface-1 text-sm text-gray-200 transition-colors"
            >
              <SlidersHorizontal className="w-4 h-4 text-muted" />
              Ajustar capital
            </button>
          </div>
        </div>

        {/* ─── Resumen principal ─── */}
        <section className="glass p-5 lg:p-7">
          <div className="grid lg:grid-cols-[1.3fr_2fr] gap-6 lg:gap-10 lg:items-center">
            <div>
              <p className="label">Capital en guaraníes</p>
              <p className="num mt-2 text-3xl sm:text-4xl lg:text-[34px] xl:text-4xl font-semibold text-white tracking-tight whitespace-nowrap">
                {formatPYG(totalPYG)}
              </p>
              <p className="text-xs text-muted mt-2">
                Efectivo + {BANK_ACCOUNTS.length} bancos
                {fxAtCost > 0 && (
                  <>
                    {' · '}divisas al costo <span className="num text-gray-300">{formatPYG(fxAtCost)}</span>
                  </>
                )}
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-5 lg:border-l lg:border-border lg:pl-10 pt-5 lg:pt-0 border-t lg:border-t-0 border-border">
              <Stat label={`Ganancia ${dayLabel}`} value={signed(profit)} tone={profit >= 0 ? 'profit' : 'loss'} />
              <Stat label="Gastos" value={formatPYG(expenses)} tone={expenses > 0 ? 'expense' : undefined} />
              <Stat label="Neto" value={signed(net)} tone={net >= 0 ? 'profit' : 'loss'} />
              <Stat label="Operaciones" value={String(dateOperations.length)} />
            </div>
          </div>
        </section>

        {/* ─── Cuentas ─── */}
        <section>
          <SectionTitle title="Cuentas en guaraníes" hint="Tocá una cuenta para corregir su saldo" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {pygAccounts.map((acc) => {
              const bal = state.accountBalances[acc] || 0;
              return (
                <button
                  key={acc}
                  type="button"
                  onClick={() => setAccountToEdit(acc)}
                  className="glass-subtle card-hover group p-3.5 flex items-center gap-3.5 text-left"
                >
                  <BankLogo account={acc} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted truncate">{acc === 'Efectivo PYG' ? 'Efectivo en mano' : acc}</p>
                    <p className={cn('num text-[17px] font-semibold truncate mt-0.5', bal < 0 ? 'text-loss' : 'text-white')}>
                      {formatPYG(bal)}
                    </p>
                  </div>
                  <Pencil className="w-4 h-4 text-gray-600 group-hover:text-gray-300 transition-colors shrink-0" />
                </button>
              );
            })}
          </div>
        </section>

        {/* ─── Divisas ─── */}
        <section>
          <SectionTitle title="Billetes en caja" hint="Stock de divisas y costo promedio (PPP)" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {CURRENCIES.map((cur) => {
              const stock = state.currencyStocks[cur];
              const decimals = cur === 'ARS' ? 0 : 2;
              return (
                <button
                  key={cur}
                  type="button"
                  onClick={() => setCurrencyToEdit(cur)}
                  className="glass-subtle card-hover group p-4 text-left"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs text-muted">
                      <span className="num text-[10px] font-semibold text-gray-200 bg-surface-3 rounded px-1.5 py-0.5">
                        {cur}
                      </span>
                      {CURRENCY_LABELS[cur]}
                    </span>
                    <Pencil className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-300 transition-colors" />
                  </div>
                  <p className="num text-xl font-semibold text-white mt-3 truncate">
                    <span className="text-muted text-sm font-normal mr-1">{CURRENCY_SYMBOLS[cur]}</span>
                    {formatCurrency(stock.amount, decimals)}
                  </p>
                  <p className="num text-xs text-muted mt-1.5">
                    PPP{' '}
                    <span className="text-gray-300">
                      {stock.averageCost > 0
                        ? `Gs. ${formatCurrency(stock.averageCost, cur === 'ARS' ? 1 : 0)}`
                        : '—'}
                    </span>
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* ─── Movimientos ─── */}
        <section className="pb-4">
          <SectionTitle
            title={isSelectedToday ? 'Movimientos de hoy' : `Movimientos · ${formatDisplayDate(selectedDate)}`}
            hint={volume > 0 ? `Volumen operado ${formatPYG(volume)}` : undefined}
          />
          <DateSelector selectedDate={selectedDate} onSelectDate={setSelectedDate} className="mb-3" />

          <div className="glass overflow-hidden">
            {dateOperations.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-sm text-gray-200">Sin movimientos {isSelectedToday ? 'hoy' : 'en esta fecha'}</p>
                <p className="text-xs text-muted mt-1.5">
                  {isSelectedToday
                    ? 'Registrá operaciones por WhatsApp o desde la pestaña Registrar.'
                    : 'Elegí otra fecha o volvé a hoy.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {[...dateOperations].reverse().map((op) => {
                  const meta = TYPE_META[op.type];
                  const Icon = meta.icon;
                  return (
                    <li key={op.id} className="group flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60 transition-colors">
                      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', meta.bg)}>
                        <Icon className={cn('w-4 h-4', meta.color)} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {op.currency && op.amount ? (
                            <>
                              <span className="font-medium">{meta.label}</span>{' '}
                              <span className="num">
                                {CURRENCY_SYMBOLS[op.currency]} {formatCurrency(op.amount)}
                              </span>
                              <span className="text-muted num">
                                {' '}× {formatCurrency(op.rate || 0, op.currency === 'ARS' ? 1 : 0)}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="font-medium">{meta.label}</span>
                              {op.description && <span className="text-gray-300"> · {op.description}</span>}
                            </>
                          )}
                        </p>
                        <p className="text-xs text-muted mt-0.5 flex items-center gap-1.5 truncate">
                          <span className="num">#{op.operationNumber}</span>
                          <span>·</span>
                          <span className="num">{formatTime(op.timestamp)}</span>
                          <span>·</span>
                          <span className="truncate">{op.account}</span>
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p
                          className={cn(
                            'num text-sm font-semibold',
                            op.type === 'COMPRA' || op.type === 'GASTO' ? 'text-gray-200' : 'text-white'
                          )}
                        >
                          {op.type === 'VENTA' ? '+' : '−'}
                          {formatPYG(op.totalPYG).replace('-', '')}
                        </p>
                        {op.profit !== undefined && (
                          <p className={cn('num text-xs mt-0.5', op.profit >= 0 ? 'text-profit' : 'text-loss')}>
                            {signed(op.profit)}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setOpToDelete(op)}
                        className="p-2 -mr-1 rounded-lg text-gray-600 hover:text-loss hover:bg-loss/10 lg:opacity-0 lg:group-hover:opacity-100 focus:opacity-100 transition shrink-0"
                        title={`Eliminar operación #${op.operationNumber}`}
                        aria-label={`Eliminar operación #${op.operationNumber}`}
                      >
                        <Trash2 className="w-4 h-4" />
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
        onSave={async (account, newBalance) => {
          await updateSingleAccountBalance(account, newBalance);
        }}
      />

      <EditCurrencyModal
        currency={currencyToEdit}
        currentStock={currencyToEdit ? state.currencyStocks[currencyToEdit] || null : null}
        isOpen={!!currencyToEdit}
        onClose={() => setCurrencyToEdit(null)}
        onSave={async (currency, amount, avgCost) => {
          await updateSingleCurrencyStock(currency, amount, avgCost);
        }}
      />

      <AdjustCashModal isOpen={isAdjustModalOpen} onClose={() => setIsAdjustModalOpen(false)} />

      <DeleteOpModal
        operation={opToDelete}
        isOpen={!!opToDelete}
        onClose={() => setOpToDelete(null)}
        onConfirm={(id) => {
          deleteOperation(id).then((ok) => {
            if (!ok) alert('No se pudo eliminar la operación. Revisá la conexión con la base de datos.');
          });
        }}
      />
    </div>
  );
}
