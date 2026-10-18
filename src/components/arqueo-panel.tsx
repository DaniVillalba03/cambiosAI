'use client';

import { useState, useMemo } from 'react';
import {
  ClipboardCheck,
  Copy,
  CheckCircle2,
  Banknote,
  Landmark,
  DollarSign,
  TrendingUp,
  Receipt,
  Hash,
} from 'lucide-react';
import { useAppState } from '@/store/app-context';
import {
  CURRENCIES,
  CURRENCY_FLAGS,
  CURRENCY_LABELS,
  CURRENCY_SYMBOLS,
  BANK_ACCOUNTS,
  BANK_COLORS,
} from '@/types';
import { formatPYG, formatCurrency, cn } from '@/lib/utils';
import { BankLogo } from '@/components/bank-logo';

export function ArqueoPanel() {
  const { state, todayOperations, todayProfit, todayExpenses } = useAppState();
  const [copied, setCopied] = useState(false);

  const summary = useMemo(() => {
    const dateStr = new Date().toLocaleDateString('es-PY', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const totalOps = todayOperations.length;
    const buys = todayOperations.filter((o) => o.type === 'COMPRA').length;
    const sells = todayOperations.filter((o) => o.type === 'VENTA').length;
    const expenses = todayOperations.filter((o) => o.type === 'GASTO').length;
    const netFlow = todayProfit - todayExpenses;

    let whatsappMsg = `📊 *CIERRE DE CAJA - CambiosAI*\n`;
    whatsappMsg += `📅 ${dateStr}\n`;
    whatsappMsg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

    whatsappMsg += `📈 *RESUMEN DEL DÍA*\n`;
    whatsappMsg += `• Operaciones: ${totalOps} (${buys} compras, ${sells} ventas, ${expenses} gastos)\n`;
    whatsappMsg += `• 🟢 *Ganancia Cambiaria:* ${formatPYG(todayProfit)}\n`;
    whatsappMsg += `• ⛽ Gastos del Día: ${formatPYG(todayExpenses)}\n`;
    whatsappMsg += `• 💼 *Flujo Neto Final:* ${formatPYG(netFlow)}\n\n`;

    whatsappMsg += `💵 *STOCK DE DIVISAS*\n`;
    for (const cur of CURRENCIES) {
      const stock = state.currencyStocks[cur];
      if (stock.amount > 0) {
        whatsappMsg += `${CURRENCY_FLAGS[cur]} ${cur}: ${CURRENCY_SYMBOLS[cur]} ${formatCurrency(stock.amount, cur === 'ARS' ? 0 : 2)}`;
        whatsappMsg += ` (PPP: Gs. ${formatCurrency(stock.averageCost, 0)})\n`;
      }
    }

    whatsappMsg += `\n🏦 *SALDOS EN GUARANÍES*\n`;
    whatsappMsg += `💰 Efectivo: ${formatPYG(state.accountBalances['Efectivo PYG'])}\n`;
    for (const bank of BANK_ACCOUNTS) {
      whatsappMsg += `🏛️ ${bank}: ${formatPYG(state.accountBalances[bank])}\n`;
    }

    whatsappMsg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    whatsappMsg += `✅ Generado por CambiosAI`;

    return { dateStr, totalOps, buys, sells, expenses, currencyProfit: todayProfit, expensesTotal: todayExpenses, netFlow, whatsappMsg };
  }, [state, todayOperations, todayProfit, todayExpenses]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(summary.whatsappMsg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = summary.whatsappMsg;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-bold text-white">Arqueo / Cierre de Caja</h2>
        </div>
        <span className="text-xs text-gray-500 bg-surface-2 px-3 py-1.5 rounded-full">
          {summary.dateStr}
        </span>
      </div>

      {/* ─── Resumen del Día ─── */}
      <div className="glass glow-accent p-5">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-accent" />
          Resumen Financiero del Día
        </h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-surface-2/40 rounded-xl">
            <Hash className="w-5 h-5 text-gray-400 mx-auto mb-1" />
            <p className="text-2xl font-bold text-white">{summary.totalOps}</p>
            <p className="text-xs text-gray-500">Operaciones ({summary.buys} C / {summary.sells} V)</p>
          </div>
          <div className="text-center p-3 bg-surface-2/40 rounded-xl border border-profit/20">
            <TrendingUp className="w-5 h-5 text-profit mx-auto mb-1" />
            <p className="text-xl font-black text-profit">+{formatPYG(summary.currencyProfit)}</p>
            <p className="text-xs text-profit font-semibold">Ganancia Cambiaria</p>
          </div>
          <div className="text-center p-3 bg-surface-2/40 rounded-xl border border-expense/20">
            <Receipt className="w-5 h-5 text-expense mx-auto mb-1" />
            <p className="text-xl font-bold text-expense">{formatPYG(summary.expensesTotal)}</p>
            <p className="text-xs text-expense font-semibold">Gastos del Día</p>
          </div>
          <div className="text-center p-3 bg-surface-2/40 rounded-xl border border-border">
            <DollarSign className="w-5 h-5 text-accent mx-auto mb-1" />
            <p className={cn('text-xl font-bold', summary.netFlow >= 0 ? 'text-profit' : 'text-loss')}>
              {summary.netFlow >= 0 ? '+' : ''}{formatPYG(summary.netFlow)}
            </p>
            <p className="text-xs text-gray-400 font-semibold">Flujo Neto Final</p>
          </div>
        </div>
      </div>

      {/* ─── Arqueo de Divisas ─── */}
      <div className="glass p-5">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Banknote className="w-4 h-4 text-accent" />
          Arqueo de Divisas (Billetes en Caja)
        </h3>
        <div className="space-y-3">
          {CURRENCIES.map((cur) => {
            const stock = state.currencyStocks[cur];
            const cashBalance = state.accountBalances[`Efectivo ${cur}` as keyof typeof state.accountBalances];
            return (
              <div
                key={cur}
                className="flex items-center justify-between p-3 bg-surface-2/40 rounded-xl border border-border/30"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{CURRENCY_FLAGS[cur]}</span>
                  <div>
                    <p className="text-sm font-semibold text-white">{CURRENCY_LABELS[cur]}</p>
                    <p className="text-xs text-gray-500">
                      PPP: Gs. {stock.averageCost > 0 ? formatCurrency(stock.averageCost, 0) : '—'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-white">
                    {CURRENCY_SYMBOLS[cur]} {formatCurrency(cashBalance, cur === 'ARS' ? 0 : 2)}
                  </p>
                  <p className="text-xs text-gray-500">
                    ≈ {formatPYG(cashBalance * (stock.averageCost || 0))}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Saldos Bancarios ─── */}
      <div className="glass p-5">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Landmark className="w-4 h-4 text-accent" />
          Saldos en Cuentas (Gs.)
        </h3>
        <div className="space-y-2.5">
          <div className="flex items-center justify-between p-3 bg-surface-2/40 hover:bg-surface-2/60 transition-colors rounded-xl border border-emerald-500/20">
            <div className="flex items-center gap-3">
              <BankLogo account="Efectivo PYG" size="sm" />
              <span className="text-sm font-medium text-gray-200">Efectivo Gs.</span>
            </div>
            <span className="text-lg font-bold text-emerald-400 font-mono">
              {formatPYG(state.accountBalances['Efectivo PYG'])}
            </span>
          </div>
          {BANK_ACCOUNTS.map((bank) => {
            return (
              <div
                key={bank}
                className="flex items-center justify-between p-3 bg-surface-2/40 hover:bg-surface-2/60 transition-colors rounded-xl border border-white/5"
              >
                <div className="flex items-center gap-3">
                  <BankLogo account={bank} size="sm" />
                  <span className="text-sm font-medium text-gray-200">{bank}</span>
                </div>
                <span className="text-lg font-bold text-gray-100 font-mono">
                  {formatPYG(state.accountBalances[bank])}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Gastos del Día ─── */}
      {todayExpenses > 0 && (
        <div className="glass p-5">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-expense" />
            Gastos del Día
          </h3>
          <div className="space-y-2">
            {todayOperations
              .filter((op) => op.type === 'GASTO')
              .map((op) => (
                <div
                  key={op.id}
                  className="flex items-center justify-between p-3 bg-surface-2/40 rounded-xl"
                >
                  <span className="text-sm text-gray-300">{op.description || 'Gasto'}</span>
                  <span className="text-sm font-bold text-expense">{formatPYG(op.totalPYG)}</span>
                </div>
              ))}
            <div className="flex items-center justify-between p-3 bg-expense/10 rounded-xl border border-expense/20">
              <span className="text-sm font-semibold text-expense">Total Gastos</span>
              <span className="text-lg font-bold text-expense">{formatPYG(todayExpenses)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ─── Botón Copiar para WhatsApp ─── */}
      <button
        onClick={handleCopy}
        className={cn(
          'w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-semibold text-base transition-all duration-300',
          copied
            ? 'bg-profit/20 text-profit border border-profit/30'
            : 'bg-whatsapp/90 text-white hover:bg-whatsapp shadow-lg shadow-whatsapp/20 active:scale-[0.98]'
        )}
      >
        {copied ? (
          <>
            <CheckCircle2 className="w-5 h-5" />
            ¡Copiado al portapapeles!
          </>
        ) : (
          <>
            <Copy className="w-5 h-5" />
            Copiar Resumen para WhatsApp
          </>
        )}
      </button>

      <div className="h-4" />
    </div>
  );
}
