'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Area,
  AreaChart,
} from 'recharts';
import { BarChart3, PieChart as PieIcon, TrendingUp } from 'lucide-react';
import { useAppState } from '@/store/app-context';
import { CURRENCIES, CURRENCY_LABELS, Currency } from '@/types';
import { formatPYG, formatCurrency, isToday } from '@/lib/utils';

const CHART_COLORS = {
  buy: '#60a5fa',
  sell: '#fbbf24',
  USD: '#22d3ee',
  BRL: '#34d399',
  ARS: '#f97316',
  EUR: '#a78bfa',
  profit: '#34d399',
  expense: '#f87171',
};

const PIE_COLORS = ['#22d3ee', '#34d399', '#f97316', '#a78bfa', '#60a5fa', '#fbbf24'];

// Custom tooltip component
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface-1 border border-border rounded-xl px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-sm font-semibold" style={{ color: entry.color }}>
          {entry.name}: {formatPYG(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function ReportsPanel() {
  const { todayOperations } = useAppState();

  // ─── Bar chart: Compras vs Ventas por moneda ───
  const barData = useMemo(() => {
    return CURRENCIES.map((cur) => {
      const buys = todayOperations
        .filter((op) => op.type === 'COMPRA' && op.currency === cur)
        .reduce((sum, op) => sum + op.totalPYG, 0);
      const sells = todayOperations
        .filter((op) => op.type === 'VENTA' && op.currency === cur)
        .reduce((sum, op) => sum + op.totalPYG, 0);
      return {
        name: CURRENCY_LABELS[cur],
        Compras: buys,
        Ventas: sells,
      };
    }).filter((d) => d.Compras > 0 || d.Ventas > 0);
  }, [todayOperations]);

  // ─── Pie chart: Volumen operado por divisa ───
  const pieData = useMemo(() => {
    return CURRENCIES.map((cur) => {
      const volume = todayOperations
        .filter((op) => op.currency === cur && op.type !== 'GASTO')
        .reduce((sum, op) => sum + op.totalPYG, 0);
      return {
        name: CURRENCY_LABELS[cur],
        value: volume,
        currency: cur,
      };
    }).filter((d) => d.value > 0);
  }, [todayOperations]);

  // ─── Line chart: Evolución ganancia acumulada ───
  const profitEvolution = useMemo(() => {
    let cumProfit = 0;
    return todayOperations
      .filter((op) => op.type === 'VENTA')
      .map((op, i) => {
        cumProfit += op.profit || 0;
        return {
          name: `Op ${op.operationNumber}`,
          ganancia: cumProfit,
          opProfit: op.profit || 0,
        };
      });
  }, [todayOperations]);

  const hasData = todayOperations.length > 0;

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-bold text-white">Reportes del Día</h2>
      </div>

      {!hasData ? (
        <div className="glass p-12 text-center">
          <BarChart3 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500">Los gráficos se actualizan con cada operación.</p>
        </div>
      ) : (
        <>
          {/* ─── Compras vs Ventas por Moneda ─── */}
          <div className="glass p-5">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-accent" />
              Compras vs Ventas por Moneda (Gs.)
            </h3>
            <div className="h-64 lg:h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3b50" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} />
                  <YAxis
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    axisLine={false}
                    tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: '12px', color: '#d1d5db' }}
                  />
                  <Bar dataKey="Compras" fill={CHART_COLORS.buy} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Ventas" fill={CHART_COLORS.sell} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ─── Distribución de Volumen ─── */}
            <div className="glass p-5">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-accent" />
                Distribución de Volumen
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ name, percent }: { name?: string; percent?: number }) =>
                        `${name || ''} ${((percent ?? 0) * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                    >
                      {pieData.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                          stroke="transparent"
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: any) => formatPYG(Number(value) || 0)}
                      contentStyle={{
                        backgroundColor: '#111827',
                        border: '1px solid #2d3b50',
                        borderRadius: '12px',
                        fontSize: '12px',
                        color: '#fff',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ─── Evolución de Ganancia ─── */}
            <div className="glass p-5">
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-profit" />
                Evolución de Ganancia
              </h3>
              {profitEvolution.length > 0 ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={profitEvolution}>
                      <defs>
                        <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={CHART_COLORS.profit} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={CHART_COLORS.profit} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d3b50" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: '#9ca3af', fontSize: 11 }}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fill: '#9ca3af', fontSize: 11 }}
                        axisLine={false}
                        tickFormatter={(v) =>
                          v >= 1_000_000
                            ? `${(v / 1_000_000).toFixed(1)}M`
                            : `${(v / 1_000).toFixed(0)}k`
                        }
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="ganancia"
                        name="Ganancia Acum."
                        stroke={CHART_COLORS.profit}
                        fill="url(#profitGrad)"
                        strokeWidth={2.5}
                        dot={{ r: 4, fill: CHART_COLORS.profit, stroke: '#111827', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-56 flex items-center justify-center">
                  <p className="text-gray-600 text-sm">
                    Las ganancias se muestran con cada venta.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
