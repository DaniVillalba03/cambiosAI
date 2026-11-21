'use client';

import { useMemo } from 'react';
import { Download } from 'lucide-react';
import { useAppState } from '@/store/app-context';
import { CURRENCIES, CURRENCY_SYMBOLS } from '@/types';
import { formatPYG, formatCurrency, toLocalISODate, getPreviousDay, isSameDay, cn } from '@/lib/utils';
import { SectionHeader } from './ui';
import { CURRENCY_PLURAL, signed } from './dashboard';

export function ReportsPanel() {
  const { state } = useAppState();

  // Últimos 7 días: ganancia menos gastos de cada día
  const week = useMemo(() => {
    const days: string[] = [];
    let d = toLocalISODate(new Date());
    for (let i = 0; i < 7; i++) {
      days.unshift(d);
      d = getPreviousDay(d);
    }
    return days.map((day) => {
      const ops = state.operations.filter((op) => isSameDay(op.timestamp, day));
      const profit = ops.reduce((s, o) => s + (o.profit || 0), 0);
      const expenses = ops.filter((o) => o.type === 'GASTO').reduce((s, o) => s + o.totalPYG, 0);
      const [y, m, dd] = day.split('-').map(Number);
      const label = new Date(y, m - 1, dd).toLocaleDateString('es-PY', { weekday: 'short' }).replace('.', '');
      const long = new Date(y, m - 1, dd).toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' });
      return { day, label: label.charAt(0).toUpperCase() + label.slice(1), long, net: profit - expenses, ops: ops.length };
    });
  }, [state.operations]);

  const weekTotal = week.reduce((s, d) => s + d.net, 0);
  const weekOps = week.reduce((s, d) => s + d.ops, 0);
  const maxAbs = Math.max(...week.map((d) => Math.abs(d.net)));
  const best = week.reduce((a, b) => (b.net > a.net ? b : a), week[0]);

  // Qué se movió en la semana por moneda
  const byCurrency = useMemo(() => {
    const from = week[0].day;
    const ops = state.operations.filter((op) => toLocalISODate(new Date(op.timestamp)) >= from);
    return CURRENCIES.map((c) => {
      const bought = ops.filter((o) => o.type === 'COMPRA' && o.currency === c).reduce((s, o) => s + (o.amount || 0), 0);
      const sold = ops.filter((o) => o.type === 'VENTA' && o.currency === c).reduce((s, o) => s + (o.amount || 0), 0);
      const profit = ops.filter((o) => o.currency === c).reduce((s, o) => s + (o.profit || 0), 0);
      return { c, bought, sold, profit };
    }).filter((r) => r.bought > 0 || r.sold > 0);
  }, [state.operations, week]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 lg:py-10 space-y-8">
        <header className="px-1">
          <h1 className="font-serif text-3xl font-semibold text-ink">Informes</h1>
          <p className="text-ink-3 mt-1">Los últimos 7 días.</p>
        </header>

        <section className="card p-5 sm:p-7">
          <p className="text-ink-2">Quedó en la semana</p>
          <p className={cn('money text-[40px] sm:text-5xl font-semibold leading-tight mt-1', weekTotal < 0 ? 'text-neg' : 'text-pos')}>
            {signed(weekTotal)}
          </p>
          <p className="text-[15px] text-ink-3 mt-1">
            {weekOps} operaciones
            {best && best.net > 0 && (
              <>
                {' · '}el mejor día fue el {best.long}
              </>
            )}
          </p>

        </section>

        <section>
          <SectionHeader title="Día por día" />
          <div className="card divide-y divide-line">
            {[...week].reverse().map((d) => {
              const pct = maxAbs > 0 ? Math.max(4, Math.round((Math.abs(d.net) / maxAbs) * 100)) : 0;
              return (
                <div key={d.day} className="px-5 py-3.5">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-base text-ink first-letter:uppercase">{d.long}</span>
                    {d.ops === 0 ? (
                      <span className="text-[15px] text-ink-3 whitespace-nowrap">Sin movimiento</span>
                    ) : (
                      <span
                        className={cn(
                          'money text-lg font-semibold whitespace-nowrap',
                          d.net < 0 ? 'text-neg' : d.net > 0 ? 'text-pos' : 'text-ink'
                        )}
                      >
                        {signed(d.net)}
                      </span>
                    )}
                  </div>
                  {d.net !== 0 && (
                    <div className="mt-2 h-2 rounded-full bg-fill overflow-hidden">
                      <div className={cn('h-full rounded-full', d.net < 0 ? 'bg-neg' : 'bg-pos')} style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-sm text-ink-3 mt-2 px-1">Ganancia por cambios menos gastos de cada día.</p>
        </section>

        <section>
          <SectionHeader title="Por moneda" />
          {byCurrency.length === 0 ? (
            <div className="card px-6 py-10 text-center text-base text-ink-2">No hubo compras ni ventas esta semana.</div>
          ) : (
            <div className="card divide-y divide-line">
              {byCurrency.map((r) => {
                const dec = r.c === 'ARS' ? 0 : 2;
                const sym = CURRENCY_SYMBOLS[r.c];
                return (
                  <div key={r.c} className="px-5 py-4">
                    <div className="flex justify-between gap-4">
                      <span className="text-base font-semibold text-ink">{CURRENCY_PLURAL[r.c]}</span>
                      <span className={cn('money text-base font-semibold', r.profit < 0 ? 'text-neg' : 'text-pos')}>
                        ganó {signed(r.profit)}
                      </span>
                    </div>
                    <p className="text-[15px] text-ink-2 mt-1 tabular">
                      Compró {sym} {formatCurrency(r.bought, dec)} · Vendió {sym} {formatCurrency(r.sold, dec)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="pb-6">
          <SectionHeader title="Copia de seguridad" />
          <div className="card p-5">
            <p className="text-base text-ink-2">
              Todos los domingos se guarda una copia automática. También podés bajar una ahora y guardarla en tu
              computadora o en el celular.
            </p>
            <a
              href="/api/backup"
              download
              className="mt-4 inline-flex items-center justify-center gap-2 h-12 px-5 rounded-xl border border-line-strong bg-card text-base font-semibold text-ink hover:bg-fill"
            >
              <Download className="w-5 h-5" />
              Descargar copia
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
