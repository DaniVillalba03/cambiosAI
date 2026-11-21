'use client';

import { useState, useMemo } from 'react';
import { Copy, Check } from 'lucide-react';
import { useAppState } from '@/store/app-context';
import { CURRENCIES, CURRENCY_SYMBOLS, BANK_ACCOUNTS, Account } from '@/types';
import { formatPYG, formatCurrency, cn, toLocalISODate, isSameDay, formatDisplayDate } from '@/lib/utils';
import { BankLogo } from '@/components/bank-logo';
import { DateSelector } from '@/components/date-selector';
import { SectionHeader } from './ui';
import { CURRENCY_PLURAL, signed } from './dashboard';

export function ArqueoPanel() {
  const { state } = useAppState();
  const [selectedDate, setSelectedDate] = useState(() => toLocalISODate(new Date()));
  const [copied, setCopied] = useState(false);

  const ops = useMemo(
    () => state.operations.filter((op) => isSameDay(op.timestamp, selectedDate)),
    [state.operations, selectedDate]
  );
  const profit = ops.reduce((s, o) => s + (o.profit || 0), 0);
  const expenses = ops.filter((o) => o.type === 'GASTO');
  const expensesTotal = expenses.reduce((s, o) => s + o.totalPYG, 0);
  const net = profit - expensesTotal;
  // Los ingresos (cobros, depósitos) no son ganancia cambiaria: se muestran aparte
  const incomes = ops.filter((o) => o.type === 'INGRESO').reduce((s, o) => s + o.totalPYG, 0);
  const buys = ops.filter((o) => o.type === 'COMPRA').length;
  const sells = ops.filter((o) => o.type === 'VENTA').length;

  const accounts: Account[] = ['Efectivo PYG', ...BANK_ACCOUNTS];
  const name = (a: Account) => (a === 'Efectivo PYG' ? 'Efectivo' : a);

  const message = useMemo(() => {
    const lines = [
      `*Cierre de caja — ${formatDisplayDate(selectedDate)}*`,
      '',
      `Operaciones: ${ops.length} (${buys} compras, ${sells} ventas, ${expenses.length} gastos)`,
      `Ganancia: ${signed(profit)}`,
      `Gastos: ${formatPYG(expensesTotal)}`,
      ...(incomes > 0 ? [`Entró aparte (cobros): ${formatPYG(incomes)}`] : []),
      `*Queda: ${signed(net)}*`,
      '',
      '*Guaraníes*',
      ...accounts.map((a) => `${name(a)}: ${formatPYG(state.accountBalances[a] || 0)}`),
    ];
    const withStock = CURRENCIES.filter((c) => state.currencyStocks[c].amount > 0);
    if (withStock.length) {
      lines.push('', '*Billetes*');
      withStock.forEach((c) => {
        const s = state.currencyStocks[c];
        lines.push(
          `${CURRENCY_PLURAL[c]}: ${CURRENCY_SYMBOLS[c]} ${formatCurrency(s.amount, c === 'ARS' ? 0 : 2)} (costo Gs. ${formatCurrency(s.averageCost, 0)})`
        );
      });
    }
    return lines.join('\n');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, ops, selectedDate]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = message;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 lg:py-10 space-y-8">
        <header className="px-1">
          <h1 className="font-serif text-3xl font-semibold text-ink">Cierre del día</h1>
          <p className="text-ink-3 mt-1">Cómo terminó el día y cuánto hay en cada lugar.</p>
        </header>

        <div className="card px-2 sm:px-3 py-2">
          <DateSelector selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </div>

        {/* ─── Resultado ─── */}
        <section className="card p-5 sm:p-7">
          <p className="text-ink-2">Queda del día</p>
          <p className={cn('money text-[40px] sm:text-5xl font-semibold leading-tight mt-1', net < 0 ? 'text-neg' : 'text-pos')}>
            {signed(net)}
          </p>
          <dl className="mt-5 pt-5 border-t border-line space-y-3 text-base">
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">Ganancia por cambios</dt>
              <dd className="money font-semibold text-ink">{signed(profit)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">Gastos</dt>
              <dd className="money font-semibold text-ink">−{formatPYG(expensesTotal)}</dd>
            </div>
            {incomes > 0 && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink-2">Entró aparte (cobros)</dt>
                <dd className="money font-semibold text-ink">+{formatPYG(incomes)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <dt className="text-ink-2">Operaciones</dt>
              <dd className="text-ink tabular">
                {ops.length}
                <span className="text-ink-3">
                  {' '}
                  ({buys} compras, {sells} ventas)
                </span>
              </dd>
            </div>
          </dl>
        </section>

        {expenses.length > 0 && (
          <section>
            <SectionHeader title="Gastos" />
            <div className="card divide-y divide-line">
              {expenses.map((op) => (
                <div key={op.id} className="flex justify-between gap-4 px-5 py-3.5 text-base">
                  <span className="text-ink-2 min-w-0 break-words">{op.description || 'Gasto'}</span>
                  <span className="money text-ink whitespace-nowrap">{formatPYG(op.totalPYG)}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section>
          <SectionHeader title="Saldos actuales" />
          <div className="card divide-y divide-line">
            {accounts.map((a) => (
              <div key={a} className="flex items-center gap-4 px-4 sm:px-5 py-3.5">
                <BankLogo account={a} size="sm" />
                <span className="flex-1 text-base text-ink">{name(a)}</span>
                <span className="money text-lg text-ink whitespace-nowrap">{formatPYG(state.accountBalances[a] || 0)}</span>
              </div>
            ))}
            {CURRENCIES.filter((c) => state.currencyStocks[c].amount > 0).map((c) => (
              <div key={c} className="flex items-center gap-4 px-4 sm:px-5 py-3.5">
                <span className="w-6 h-6 rounded-md bg-fill text-[10px] font-bold text-ink-2 flex items-center justify-center">
                  {c}
                </span>
                <span className="flex-1 text-base text-ink">{CURRENCY_PLURAL[c]}</span>
                <span className="money text-lg text-ink whitespace-nowrap">
                  {CURRENCY_SYMBOLS[c]} {formatCurrency(state.currencyStocks[c].amount, c === 'ARS' ? 0 : 2)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <div className="pb-6">
          <button
            type="button"
            onClick={copy}
            className={cn(
              'w-full h-14 rounded-xl inline-flex items-center justify-center gap-2 text-base font-semibold transition-colors',
              copied ? 'bg-brand-soft text-brand' : 'bg-brand text-white hover:bg-brand-hover'
            )}
          >
            {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            {copied ? 'Copiado. Pegalo en WhatsApp' : 'Copiar resumen para WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  );
}
