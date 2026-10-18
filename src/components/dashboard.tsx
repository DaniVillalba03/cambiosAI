'use client';

import { useState } from 'react';
import {
  TrendingUp,
  ArrowDownCircle,
  ArrowUpCircle,
  Receipt,
  Wallet,
  Trash2,
  DollarSign,
  Landmark,
  Clock,
  Hash,
  Banknote,
  SlidersHorizontal,
  Cloud,
  CloudOff,
  Coins,
  ArrowRight,
} from 'lucide-react';
import { useAppState } from '@/store/app-context';
import { formatPYG, formatCurrency, formatTime, cn } from '@/lib/utils';
import { CURRENCIES, CURRENCY_FLAGS, CURRENCY_LABELS, CURRENCY_SYMBOLS, BANK_COLORS, BANK_ACCOUNTS, Operation } from '@/types';
import { AdjustCashModal } from './adjust-cash-modal';
import { BankLogo, BankPill } from './bank-logo';
import { DeleteOpModal } from './delete-op-modal';

export function Dashboard() {
  const {
    state,
    todayOperations,
    todayProfit,
    todayExpenses,
    todayNetFlow,
    todayVolume,
    supabaseStatus,
    deleteOperation,
  } = useAppState();

  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [opToDelete, setOpToDelete] = useState<Operation | null>(null);

  const totalOps = todayOperations.length;

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6 space-y-5">
      {/* ─── Cloud Sync Status Banner ─── */}
      {supabaseStatus.tableMissing && (
        <div className="p-3.5 bg-blue-500/10 border border-blue-500/30 rounded-2xl flex items-center justify-between gap-3 text-xs text-blue-300">
          <div className="flex items-center gap-2.5">
            <CloudOff className="w-4 h-4 text-blue-400 shrink-0" />
            <span>
              <strong>Modo Local Activo:</strong> Ejecutá el archivo <code>supabase-schema.sql</code> en el SQL Editor de tu proyecto Supabase para activar la persistencia en la nube y sincronización en tiempo real.
            </span>
          </div>
          <span className="shrink-0 font-bold bg-blue-500/20 px-2 py-0.5 rounded">Offline / Local</span>
        </div>
      )}

      {/* ─── Top Bar with Adjust Cash button ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {supabaseStatus.connected ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Nube Supabase: Tiempo Real
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-surface-2 text-gray-400 border border-border">
              <Cloud className="w-3.5 h-3.5 text-gray-400" />
              Almacenamiento Local
            </span>
          )}
        </div>

        <button
          onClick={() => setIsAdjustModalOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-surface-2 hover:bg-surface-3 text-gray-200 border border-border/80 rounded-xl text-xs font-semibold transition-all shadow-sm"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-accent" />
          Ajustar Caja / Nuevo Día
        </button>
      </div>

      {/* ─── Hero Card: Ganancia Cambiaria de Hoy ─── */}
      <div className="glass glow-profit p-5 lg:p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-profit/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
        <div className="relative">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-profit/10 rounded-xl">
                <TrendingUp className="w-5 h-5 text-profit" />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-200">Ganancia Cambiaria de Hoy</p>
                <p className="text-[11px] text-gray-400">Spread puro de compra y venta de divisas</p>
              </div>
            </div>
            <span className="text-xs text-gray-400 px-3 py-1 bg-surface-2/80 rounded-full border border-border/40">
              {new Date().toLocaleDateString('es-PY', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
          </div>

          {/* Big Green Currency Profit Metric */}
          <div className="mt-3">
            <p className="text-3xl lg:text-5xl font-black tracking-tight text-profit">
              +{formatPYG(todayProfit)}
            </p>
          </div>

          {/* Submetrics: Gastos y Flujo Neto Final */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-5 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2/40 border border-border/30">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-expense" />
                <span className="text-xs text-gray-400">Gastos del Día:</span>
              </div>
              <span className="text-sm font-bold text-expense">
                {formatPYG(todayExpenses)}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2/40 border border-border/30">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-accent" />
                <span className="text-xs text-gray-400">Flujo Neto Final:</span>
              </div>
              <span
                className={cn(
                  'text-sm font-bold',
                  todayNetFlow >= 0 ? 'text-profit' : 'text-loss'
                )}
              >
                {todayNetFlow >= 0 ? '+' : ''}
                {formatPYG(todayNetFlow)}
              </span>
            </div>
          </div>

          {/* Operations & Volume */}
          <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-400">
            <div className="flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-gray-500" />
              <span>
                <strong className="text-gray-200">{totalOps}</strong> operaciones registradas
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Banknote className="w-3.5 h-3.5 text-gray-500" />
              <span>
                Volumen: <strong className="text-gray-200">{formatPYG(todayVolume)}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Stock de Divisas ─── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-accent" />
            Stock de Divisas (Billetes en Mano)
          </h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {CURRENCIES.map((cur) => {
            const stock = state.currencyStocks[cur];
            return (
              <div
                key={cur}
                className="glass-subtle p-4 hover:border-accent/20 transition-all duration-300 group"
              >
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-xl">{CURRENCY_FLAGS[cur]}</span>
                  <span className="text-xs font-bold text-gray-400 uppercase">{cur}</span>
                </div>
                <p className="text-xl font-bold text-white">
                  {CURRENCY_SYMBOLS[cur]} {formatCurrency(stock.amount, cur === 'ARS' ? 0 : 2)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  PPP:{' '}
                  <span className="text-gray-400 font-medium">
                    {stock.averageCost > 0
                      ? `Gs. ${formatCurrency(stock.averageCost, cur === 'ARS' ? 1 : 0)}`
                      : '—'}
                  </span>
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Saldos en Guaraníes ─── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <Landmark className="w-4 h-4 text-accent" />
            Saldos en Guaraníes
          </h2>
          <span className="text-xs text-gray-500 font-medium">Bancos & Efectivo PYG</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Efectivo PYG */}
          <div className="glass-subtle p-3.5 sm:p-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/40 transition-all flex items-center justify-between group">
            <div className="flex items-center gap-3 min-w-0">
              <BankLogo account="Efectivo PYG" size="md" />
              <div className="min-w-0">
                <span className="text-xs font-semibold text-emerald-300/80 block truncate">Efectivo Gs.</span>
                <p className="text-base sm:text-lg font-black text-emerald-400 tracking-tight truncate">
                  {formatPYG(state.accountBalances['Efectivo PYG'])}
                </p>
              </div>
            </div>
          </div>

          {/* Banks */}
          {BANK_ACCOUNTS.map((bank) => {
            const isUeno = bank.includes('Ueno');
            const isItau = bank.includes('Itaú') || bank.includes('Itau');
            const isFamiliar = bank.includes('Familiar');
            const isBNF = bank.includes('BNF');
            const isContinental = bank.includes('Continental');

            const cardBorder = isUeno
              ? 'border-violet-500/20 hover:border-violet-500/40 bg-violet-500/5'
              : isItau
              ? 'border-orange-500/20 hover:border-orange-500/40 bg-orange-500/5'
              : isFamiliar
              ? 'border-sky-500/20 hover:border-sky-500/40 bg-sky-500/5'
              : isBNF
              ? 'border-red-500/20 hover:border-red-500/40 bg-red-500/5'
              : isContinental
              ? 'border-amber-500/20 hover:border-amber-500/40 bg-amber-500/5'
              : 'border-white/5 hover:border-white/15';

            return (
              <div
                key={bank}
                className={cn(
                  'glass-subtle p-3.5 sm:p-4 rounded-2xl border transition-all flex items-center justify-between group',
                  cardBorder
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <BankLogo account={bank} size="md" />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-gray-400 block truncate">{bank}</span>
                    <p className="text-base sm:text-lg font-black text-white tracking-tight truncate">
                      {formatPYG(state.accountBalances[bank])}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Historial del Día ─── */}
      <section className="pb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent" />
            Historial del Día ({totalOps})
          </h2>
          {totalOps > 0 && (
            <span className="text-xs text-gray-500">Últimas operaciones registradas</span>
          )}
        </div>
        <div className="space-y-2.5">
          {todayOperations.length === 0 && (
            <div className="glass-subtle p-8 text-center rounded-2xl border border-white/5">
              <p className="text-gray-400 font-medium">No hay operaciones hoy.</p>
              <p className="text-xs text-gray-500 mt-1">¡Usá el Chat IA, WhatsApp o comprobantes para registrar operaciones!</p>
            </div>
          )}
          {[...todayOperations].reverse().map((op) => (
            <div
              key={op.id}
              className="glass-subtle p-3.5 sm:p-4 rounded-2xl flex items-center gap-3 border border-white/5 hover:border-white/10 transition-all group"
            >
              {/* Icon */}
              <div
                className={cn(
                  'p-2.5 rounded-xl shrink-0 flex items-center justify-center',
                  op.type === 'COMPRA' && 'bg-buy/10 text-buy border border-buy/20',
                  op.type === 'VENTA' && 'bg-sell/10 text-sell border border-sell/20',
                  op.type === 'GASTO' && 'bg-expense/10 text-expense border border-expense/20'
                )}
              >
                {op.type === 'COMPRA' && <ArrowDownCircle className="w-5 h-5 text-buy" />}
                {op.type === 'VENTA' && <ArrowUpCircle className="w-5 h-5 text-sell" />}
                {op.type === 'GASTO' && <Receipt className="w-5 h-5 text-expense" />}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={cn(
                      'text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider',
                      op.type === 'COMPRA' && 'bg-buy/20 text-buy',
                      op.type === 'VENTA' && 'bg-sell/20 text-sell',
                      op.type === 'GASTO' && 'bg-expense/20 text-expense'
                    )}
                  >
                    #{op.operationNumber} {op.type}
                  </span>
                  <BankPill account={op.account} size="xs" />
                  <span className="text-xs text-gray-500 ml-auto">{formatTime(op.timestamp)}</span>
                </div>
                <div className="flex items-baseline gap-2 mt-1.5 flex-wrap">
                  {op.amount && op.currency ? (
                    <span className="text-sm font-bold text-white">
                      {CURRENCY_FLAGS[op.currency]} {CURRENCY_SYMBOLS[op.currency]} {formatCurrency(op.amount)} @ Gs. {formatCurrency(op.rate || 0, op.currency === 'ARS' ? 1 : 0)}
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-gray-200 truncate max-w-[260px] sm:max-w-[400px]">
                      {op.description || 'Gasto / Transferencia'}
                    </span>
                  )}
                </div>
              </div>

              {/* Total and Profit */}
              <div className="text-right shrink-0">
                <p className="text-sm sm:text-base font-black text-white">{formatPYG(op.totalPYG)}</p>
                {op.profit !== undefined && (
                  <p
                    className={cn(
                      'text-xs font-bold',
                      op.profit >= 0 ? 'text-profit' : 'text-loss'
                    )}
                  >
                    {op.profit >= 0 ? '+' : ''}
                    {formatPYG(op.profit)}
                  </p>
                )}
              </div>

              {/* Delete Button (Clearly visible and accessible) */}
              <button
                type="button"
                onClick={() => setOpToDelete(op)}
                className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition-all rounded-xl border border-white/5 hover:border-red-500/20 shrink-0 ml-1"
                title={`Eliminar operación #${op.operationNumber}`}
                aria-label="Eliminar operación"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Modal para Ajustar Caja Inicial ─── */}
      <AdjustCashModal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
      />

      {/* ─── Modal para Eliminar Operación Errónea ─── */}
      <DeleteOpModal
        operation={opToDelete}
        isOpen={!!opToDelete}
        onClose={() => setOpToDelete(null)}
        onConfirm={(id) => deleteOperation(id)}
      />
    </div>
  );
}
