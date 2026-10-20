'use client';

import { useState, useMemo } from 'react';
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
  Coins,
  Pencil,
  RotateCcw,
  Calendar,
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
  CURRENCY_FLAGS,
  CURRENCY_LABELS,
  CURRENCY_SYMBOLS,
  BANK_ACCOUNTS,
  Operation,
} from '@/types';
import { AdjustCashModal } from './adjust-cash-modal';
import { EditAccountModal } from './edit-account-modal';
import { EditCurrencyModal } from './edit-currency-modal';
import { BankLogo, BankPill } from './bank-logo';
import { DeleteOpModal } from './delete-op-modal';
import { DateSelector } from './date-selector';

export function Dashboard() {
  const {
    state,
    supabaseStatus,
    deleteOperation,
    updateSingleAccountBalance,
    updateSingleCurrencyStock,
  } = useAppState();

  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<Account | null>(null);
  const [currencyToEdit, setCurrencyToEdit] = useState<Currency | null>(null);
  const [opToDelete, setOpToDelete] = useState<Operation | null>(null);

  // Selector de fecha: por defecto hoy
  const todayStr = useMemo(() => toLocalISODate(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(() => toLocalISODate(new Date()));
  const isSelectedToday = selectedDate === todayStr;

  // Movimientos filtrados por la fecha elegida (memoizado para máxima fluidez)
  const dateOperations = useMemo(() => {
    return state.operations.filter((op) => isSameDay(op.timestamp, selectedDate));
  }, [state.operations, selectedDate]);

  // Métricas financieras calculadas para la fecha seleccionada
  const dateProfit = useMemo(() => {
    return dateOperations.reduce((sum, op) => sum + (op.profit || 0), 0);
  }, [dateOperations]);

  const dateExpenses = useMemo(() => {
    return dateOperations
      .filter((op) => op.type === 'GASTO')
      .reduce((sum, op) => sum + op.totalPYG, 0);
  }, [dateOperations]);

  const dateNetFlow = dateProfit - dateExpenses;

  const totalOps = dateOperations.length;

  // Capital total disponible en guaraníes en tiempo real (Efectivo + todos los bancos)
  const totalPYGCapital = useMemo(() => {
    return (
      (state.accountBalances['Efectivo PYG'] || 0) +
      BANK_ACCOUNTS.reduce((sum, bank) => sum + (state.accountBalances[bank] || 0), 0)
    );
  }, [state.accountBalances]);

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6 space-y-6 will-change-scroll">
      {/* ─── Top Bar: Estado y Botón de Ajuste General ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-1/60 p-3 sm:p-4 rounded-2xl border border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <div>
            <p className="text-xs sm:text-sm font-bold text-white">
              Caja & Bancos • {new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <p className="text-[11px] text-gray-400">
              {supabaseStatus.connected ? 'Sincronizado en tiempo real' : 'Guardado seguro en este dispositivo'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsAdjustModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-surface-2 hover:bg-surface-3 active:scale-95 text-gray-100 border border-border hover:border-accent/40 rounded-xl text-xs sm:text-sm font-bold transition-colors shadow-sm"
        >
          <SlidersHorizontal className="w-4 h-4 text-accent" />
          Ajustar Todo el Capital
        </button>
      </div>

      {/* ─── Sección 1: Capital en Guaraníes (Bancos & Efectivo) ─── */}
      <section className="space-y-3.5">
        {/* Banner de Capital Total Guaraníes */}
        <div className="glass p-5 lg:p-6 relative overflow-hidden border border-accent/30 bg-gradient-to-br from-surface-1 via-surface-1 to-accent/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="p-1.5 bg-accent/10 rounded-lg text-accent">
                  <Landmark className="w-4 h-4" />
                </div>
                <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-accent">
                  Capital Total en Guaraníes
                </h2>
              </div>
              <p className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
                {formatPYG(totalPYGCapital)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Total disponible en efectivo y tus 5 bancos
              </p>
            </div>

            <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
              <span className="text-xs text-gray-400 font-medium">¿Querés cambiar un saldo?</span>
              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> Tocá cualquier banco abajo
              </span>
            </div>
          </div>
        </div>

        {/* Tarjetas Interactivas de Bancos y Efectivo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Efectivo PYG (Tarjeta Destacada) */}
          <button
            type="button"
            onClick={() => setAccountToEdit('Efectivo PYG')}
            className="glass-subtle p-4 rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/10 hover:border-emerald-400 hover:bg-emerald-500/15 active:scale-[0.99] transition-colors text-left flex items-center justify-between group shadow-sm"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <BankLogo account="Efectivo PYG" size="lg" />
              <div className="min-w-0">
                <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider block">
                  Efectivo en Mano
                </span>
                <p className="text-lg sm:text-xl font-black text-white tracking-tight truncate">
                  {formatPYG(state.accountBalances['Efectivo PYG'])}
                </p>
              </div>
            </div>
            <div className="shrink-0 p-2 rounded-xl bg-emerald-500/20 text-emerald-300 group-hover:bg-emerald-500 group-hover:text-surface-0 transition-colors ml-2">
              <Pencil className="w-4 h-4" />
            </div>
          </button>

          {/* Cuentas Bancarias */}
          {BANK_ACCOUNTS.map((bank) => {
            const isUeno = bank.includes('Ueno');
            const isItau = bank.includes('Itaú') || bank.includes('Itau');
            const isFamiliar = bank.includes('Familiar');
            const isBNF = bank.includes('BNF');
            const isContinental = bank.includes('Continental');

            const cardBorder = isUeno
              ? 'border-violet-500/30 hover:border-violet-400 bg-violet-500/5 hover:bg-violet-500/10'
              : isItau
              ? 'border-orange-500/30 hover:border-orange-400 bg-orange-500/5 hover:bg-orange-500/10'
              : isFamiliar
              ? 'border-sky-500/30 hover:border-sky-400 bg-sky-500/5 hover:bg-sky-500/10'
              : isBNF
              ? 'border-red-500/30 hover:border-red-400 bg-red-500/5 hover:bg-red-500/10'
              : isContinental
              ? 'border-amber-500/30 hover:border-amber-400 bg-amber-500/5 hover:bg-amber-500/10'
              : 'border-white/10 hover:border-white/30';

            return (
              <button
                key={bank}
                type="button"
                onClick={() => setAccountToEdit(bank)}
                className={cn(
                  'glass-subtle p-4 rounded-2xl border-2 transition-colors text-left flex items-center justify-between group active:scale-[0.99] shadow-sm',
                  cardBorder
                )}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <BankLogo account={bank} size="lg" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-gray-300 block truncate">
                      {bank}
                    </span>
                    <p className="text-lg sm:text-xl font-black text-white tracking-tight truncate">
                      {formatPYG(state.accountBalances[bank])}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 p-2 rounded-xl bg-surface-2 text-gray-400 group-hover:bg-accent group-hover:text-surface-0 transition-colors ml-2">
                  <Pencil className="w-4 h-4" />
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── Sección 2: Billetes en Caja (Moneda Extranjera) ─── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-accent" />
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-300">
              Billetes en Caja (Divisas)
            </h2>
          </div>
          <span className="text-xs text-gray-400">Tocá para modificar cantidad</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {CURRENCIES.map((cur) => {
            const stock = state.currencyStocks[cur];
            return (
              <button
                key={cur}
                type="button"
                onClick={() => setCurrencyToEdit(cur)}
                className="glass-subtle p-4 rounded-2xl border-2 border-white/5 hover:border-accent/40 hover:bg-surface-2/80 active:scale-[0.99] transition-colors text-left group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl select-none">{CURRENCY_FLAGS[cur]}</span>
                      <span className="text-xs font-black text-gray-300 uppercase">{cur}</span>
                    </div>
                    <span className="p-1.5 rounded-lg bg-surface-2 text-gray-400 group-hover:text-accent group-hover:bg-accent/10 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </span>
                  </div>
                  <p className="text-xl sm:text-2xl font-black text-white tracking-tight">
                    {CURRENCY_SYMBOLS[cur]} {formatCurrency(stock.amount, cur === 'ARS' ? 0 : 2)}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-white/5 flex items-center justify-between text-xs text-gray-400">
                  <span>Costo prom:</span>
                  <span className="font-bold text-gray-200">
                    {stock.averageCost > 0
                      ? `Gs. ${formatCurrency(stock.averageCost, cur === 'ARS' ? 1 : 0)}`
                      : '—'}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── Selector de Fecha para Movimientos y Ganancias ─── */}
      <section className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-accent" />
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-gray-300">
              Fecha de Consulta
            </h2>
          </div>
          <span className="text-xs text-gray-400">
            Elegí cualquier día para ver sus números
          </span>
        </div>

        <DateSelector
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
        />
      </section>

      {/* ─── Sección 3: Ganancia y Resumen del Día Seleccionado ─── */}
      <div
        className={cn(
          'glass p-5 lg:p-6 relative overflow-hidden border transition-colors',
          isSelectedToday
            ? 'glow-profit border-profit/30'
            : 'border-amber-500/40 bg-amber-500/5'
        )}
      >
        <div className="relative">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  'p-2 rounded-xl',
                  isSelectedToday ? 'bg-profit/10 text-profit' : 'bg-amber-500/10 text-amber-400'
                )}
              >
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">
                  {isSelectedToday
                    ? 'Ganancia del Día'
                    : `Ganancia del ${formatDisplayDate(selectedDate)}`}
                </p>
                <p className="text-xs text-gray-400">
                  {isSelectedToday
                    ? 'Generada por tus compras y ventas de hoy'
                    : 'Resultado obtenido en la fecha seleccionada'}
                </p>
              </div>
            </div>
            <span
              className={cn(
                'text-xs px-3 py-1 rounded-full border font-bold',
                isSelectedToday
                  ? 'bg-surface-2 text-gray-300 border-border'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              )}
            >
              {totalOps} {totalOps === 1 ? 'operación' : 'operaciones'}
            </span>
          </div>

          <div className="mt-2">
            <p
              className={cn(
                'text-3xl sm:text-5xl font-black tracking-tight',
                dateProfit >= 0 ? 'text-profit' : 'text-loss'
              )}
            >
              {dateProfit >= 0 ? '+' : ''}
              {formatPYG(dateProfit)}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4 pt-4 border-t border-border/50">
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2/60 border border-border/40">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-expense" />
                <span className="text-xs text-gray-300 font-medium">Gastos de la Fecha:</span>
              </div>
              <span className="text-sm font-black text-expense">
                {formatPYG(dateExpenses)}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-surface-2/60 border border-border/40">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-accent" />
                <span className="text-xs text-gray-300 font-medium">Dinero Limpio Restante:</span>
              </div>
              <span
                className={cn(
                  'text-sm font-black',
                  dateNetFlow >= 0 ? 'text-profit' : 'text-loss'
                )}
              >
                {dateNetFlow >= 0 ? '+' : ''}
                {formatPYG(dateNetFlow)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Sección 4: Movimientos de la Fecha (Historial) ─── */}
      <section className="pb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-accent" />
            <h2 className="text-xs sm:text-sm font-bold text-gray-300 uppercase tracking-wider">
              {isSelectedToday
                ? `Movimientos de Hoy (${totalOps})`
                : `Movimientos del ${formatDisplayDate(selectedDate)} (${totalOps})`}
            </h2>
          </div>
          {!isSelectedToday && (
            <button
              type="button"
              onClick={() => setSelectedDate(todayStr)}
              className="text-xs font-bold text-accent hover:underline flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Volver a Hoy
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {dateOperations.length === 0 ? (
            <div className="glass-subtle p-8 text-center rounded-2xl border border-white/5 space-y-2">
              <p className="text-gray-300 font-semibold text-base">
                No hay movimientos registrados en {formatDisplayDate(selectedDate)}.
              </p>
              <p className="text-xs text-gray-400">
                {isSelectedToday
                  ? '¡Usá la pestaña de Chat para registrar compras, ventas o gastos!'
                  : 'Podés elegir otra fecha en el calendario o regresar al día de hoy.'}
              </p>
              {!isSelectedToday && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(todayStr)}
                  className="mt-2 px-4 py-2 bg-surface-2 hover:bg-surface-3 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Regresar a los movimientos de Hoy
                </button>
              )}
            </div>
          ) : (
            [...dateOperations].reverse().map((op) => (
              <div
                key={op.id}
                className="glass-subtle p-3.5 sm:p-4 rounded-2xl flex items-center gap-3 border border-white/5 hover:border-white/10 transition-colors group"
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
                        {op.description || 'Gasto / Movimiento'}
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

                {/* Delete Button */}
                <button
                  type="button"
                  onClick={() => setOpToDelete(op)}
                  className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition-colors rounded-xl border border-white/5 hover:border-red-500/20 shrink-0 ml-1"
                  title={`Eliminar operación #${op.operationNumber}`}
                  aria-label="Eliminar operación"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ─── Modal para Editar Saldo de un Banco / Efectivo Directo ─── */}
      <EditAccountModal
        account={accountToEdit}
        currentBalance={accountToEdit ? state.accountBalances[accountToEdit] || 0 : 0}
        isOpen={!!accountToEdit}
        onClose={() => setAccountToEdit(null)}
        onSave={async (account, newBalance) => {
          await updateSingleAccountBalance(account, newBalance);
        }}
      />

      {/* ─── Modal para Editar Billetes de una Divisa Directo ─── */}
      <EditCurrencyModal
        currency={currencyToEdit}
        currentStock={currencyToEdit ? state.currencyStocks[currencyToEdit] || null : null}
        isOpen={!!currencyToEdit}
        onClose={() => setCurrencyToEdit(null)}
        onSave={async (currency, amount, avgCost) => {
          await updateSingleCurrencyStock(currency, amount, avgCost);
        }}
      />

      {/* ─── Modal para Ajustar Todo el Capital ─── */}
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
