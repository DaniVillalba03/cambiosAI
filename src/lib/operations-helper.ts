import { supabaseAdmin } from '@/lib/supabase';
import { formatPYG, formatCurrency } from '@/lib/utils';
import { CURRENCY_FLAGS, CURRENCY_SYMBOLS, CURRENCY_LABELS, Currency } from '@/types';

/**
 * Genera el texto del Cierre de Caja / Resumen del Día
 * consultando directamente la base de datos de Supabase.
 */
export async function generateDailySummaryMessage(): Promise<string> {
  const { data: accounts } = await supabaseAdmin.from('accounts').select('*');
  const { data: stocks } = await supabaseAdmin.from('currency_stocks').select('*');
  const { data: transactions } = await supabaseAdmin.from('transactions').select('*');

  const todayOps = (transactions || []).filter((tx: any) => {
    const d = new Date(tx.timestamp);
    const t = new Date();
    return (
      d.getDate() === t.getDate() &&
      d.getMonth() === t.getMonth() &&
      d.getFullYear() === t.getFullYear()
    );
  });

  const buys = todayOps.filter((o: any) => o.type === 'COMPRA').length;
  const sells = todayOps.filter((o: any) => o.type === 'VENTA').length;
  const expensesCount = todayOps.filter((o: any) => o.type === 'GASTO').length;

  // Ganancia Cambiaria pura por spread
  const profit = todayOps.reduce((sum: number, o: any) => sum + (Number(o.profit) || 0), 0);
  // Gastos
  const expenses = todayOps
    .filter((o: any) => o.type === 'GASTO')
    .reduce((sum: number, o: any) => sum + (Number(o.total_pyg) || 0), 0);
  const netFlow = profit - expenses;

  let msg = `📊 *CIERRE DE CAJA - CambiosAI*\n`;
  msg += `📅 ${new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  msg += `📈 *RESUMEN DEL DÍA*\n`;
  msg += `• Operaciones: ${todayOps.length} (${buys} compras, ${sells} ventas, ${expensesCount} gastos)\n`;
  msg += `• 🟢 *Ganancia Cambiaria:* ${formatPYG(profit)}\n`;
  msg += `• ⛽ Gastos del Día: ${formatPYG(expenses)}\n`;
  msg += `• 💼 *Flujo Neto Final:* ${formatPYG(netFlow)}\n\n`;

  msg += `💵 *STOCK DE DIVISAS (Billetes)*\n`;
  if (stocks && stocks.length > 0) {
    stocks.forEach((s: any) => {
      const cur = s.currency as Currency;
      if (Number(s.amount) > 0) {
        msg += `${CURRENCY_FLAGS[cur] || ''} ${cur}: ${CURRENCY_SYMBOLS[cur] || ''} ${formatCurrency(Number(s.amount), cur === 'ARS' ? 0 : 2)}`;
        msg += ` (PPP: Gs. ${formatCurrency(Number(s.average_cost), 0)})\n`;
      }
    });
  } else {
    msg += `_Sin divisas en caja_\n`;
  }

  msg += `\n🏦 *SALDOS EN GUARANÍES*\n`;
  if (accounts && accounts.length > 0) {
    const efectivo = accounts.find((a: any) => a.id === 'Efectivo PYG');
    if (efectivo) {
      msg += `💰 Efectivo: ${formatPYG(Number(efectivo.balance))}\n`;
    }
    accounts
      .filter((a: any) => a.type === 'BANK')
      .forEach((b: any) => {
        msg += `🏛️ ${b.name}: ${formatPYG(Number(b.balance))}\n`;
      });
  } else {
    msg += `_Saldos iniciales en 0_\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✅ Generado automáticamente por MiCambio`;

  return msg;
}

/**
 * Genera la guía completa de comandos y ayuda para el usuario
 */
export function generateHelpMessage(): string {
  let msg = `🤖 *GUÍA DE COMANDOS - MiCambio Bot*\n`;
  msg += `Hola! Soy tu asistente cambiario y financiero personal.\n`;
  msg += `Podés escribirme, mandarme fotos de comprobantes o notas de voz:\n\n`;

  msg += `💵 *1. REGISTRAR COMPRAS Y VENTAS*\n`;
  msg += `• _"Compré 500 dólares a 7750 por Ueno"_\n`;
  msg += `• _"Vendí 200 USD a 7820 en efectivo"_\n`;
  msg += `• _"Compré 2000 reales a 1520 con Itaú"_\n`;
  msg += `• _"500 usd a 7750 ueno"_ (modo rápido)\n\n`;

  msg += `⛽ *2. REGISTRAR GASTOS*\n`;
  msg += `• _"Gasté 150 mil en combustible con Itaú"_\n`;
  msg += `• _"Pagué 80 mil almuerzo en efectivo"_\n\n`;

  msg += `📸 *3. FOTOS DE COMPROBANTES*\n`;
  msg += `• Enviá la foto de una transferencia bancaria (SIPAP, Itaú, Ueno, Familiar, BNF, Continental) y extraigo automáticamente el monto, banco y concepto.\n\n`;

  msg += `🎙️ *4. NOTAS DE VOZ (AUDIOS)*\n`;
  msg += `• Dictá tu operación en un audio y lo registro al instante.\n\n`;

  msg += `⚡ *5. COMANDOS RÁPIDOS*\n`;
  msg += `• *ayuda*: Ver esta lista de comandos y ejemplos.\n`;
  msg += `• *saldos*: Ver cuánto dinero tenés en cada banco y en efectivo.\n`;
  msg += `• *stock*: Ver la cantidad de billetes de moneda extranjera en caja.\n`;
  msg += `• *resumen* o *cierre*: Ver las operaciones y ganancia del día de hoy.\n`;
  msg += `• *anular*: Deshacer la última operación si hubo un error.\n\n`;

  msg += `✅ Todo lo que hagas acá se sincroniza en vivo con tu aplicación web.`;
  return msg;
}

/**
 * Consulta y devuelve los saldos actuales de todos los bancos y efectivo
 */
export async function generateBalancesMessage(): Promise<string> {
  const { data: accounts } = await supabaseAdmin.from('accounts').select('*');

  let msg = `🏦 *TUS SALDOS ACTUALES*\n`;
  msg += `📅 ${new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' })}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  let totalPYG = 0;
  if (accounts && accounts.length > 0) {
    const efectivo = accounts.find((a: any) => a.id === 'Efectivo PYG');
    if (efectivo) {
      const bal = Number(efectivo.balance) || 0;
      totalPYG += bal;
      msg += `💰 *Efectivo PYG:* ${formatPYG(bal)}\n`;
    }

    accounts
      .filter((a: any) => a.type === 'BANK')
      .forEach((b: any) => {
        const bal = Number(b.balance) || 0;
        totalPYG += bal;
        msg += `🏛️ *${b.name}:* ${formatPYG(bal)}\n`;
      });

    msg += `\n💼 *Capital Total Guaraníes:* ${formatPYG(totalPYG)}\n`;
  } else {
    msg += `_No se encontraron cuentas registradas._\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Escribí *stock* para ver billetes en moneda extranjera.`;
  return msg;
}

/**
 * Consulta y devuelve el stock actual de billetes en moneda extranjera
 */
export async function generateStocksMessage(): Promise<string> {
  const { data: stocks } = await supabaseAdmin.from('currency_stocks').select('*');

  let msg = `💵 *BILLETES EN CAJA (DIVISAS)*\n`;
  msg += `📅 ${new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' })}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (stocks && stocks.length > 0) {
    stocks.forEach((s: any) => {
      const cur = s.currency as Currency;
      const amount = Number(s.amount) || 0;
      const avgCost = Number(s.average_cost) || 0;
      msg += `${CURRENCY_FLAGS[cur] || ''} *${cur}:* ${CURRENCY_SYMBOLS[cur] || ''} ${formatCurrency(amount, cur === 'ARS' ? 0 : 2)}`;
      if (avgCost > 0) {
        msg += ` (Costo prom: Gs. ${formatCurrency(avgCost, 0)})`;
      }
      msg += `\n`;
    });
  } else {
    msg += `_Sin divisas registradas._\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Escribí *saldos* para ver cuentas en guaraníes.`;
  return msg;
}


/**
 * Anula la última operación registrada en Supabase y revierte
 * los saldos en accounts y currency_stocks correspondientes.
 */
export async function undoLastOperationMessage(): Promise<{
  success: boolean;
  message: string;
  opNumber?: number;
}> {
  const { data: lastTxs } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .order('operation_number', { ascending: false })
    .limit(1);

  if (!lastTxs || lastTxs.length === 0) {
    return {
      success: false,
      message: '⚠️ No hay operaciones registradas para anular.',
    };
  }

  const lastOp = lastTxs[0];

  // Revertir saldos en accounts
  if (lastOp.type === 'COMPRA' && lastOp.currency && lastOp.amount && lastOp.rate) {
    const { data: acc } = await supabaseAdmin.from('accounts').select('balance').eq('id', lastOp.account).single();
    if (acc) {
      await supabaseAdmin
        .from('accounts')
        .update({ balance: Number(acc.balance) + Number(lastOp.total_pyg) })
        .eq('id', lastOp.account);
    }
    const cashAcc = `Efectivo ${lastOp.currency}`;
    const { data: cash } = await supabaseAdmin.from('accounts').select('balance').eq('id', cashAcc).single();
    if (cash) {
      await supabaseAdmin
        .from('accounts')
        .update({ balance: Math.max(0, Number(cash.balance) - Number(lastOp.amount)) })
        .eq('id', cashAcc);
    }
    const { data: stock } = await supabaseAdmin.from('currency_stocks').select('*').eq('currency', lastOp.currency).single();
    if (stock) {
      const newAmount = Math.max(0, Number(stock.amount) - Number(lastOp.amount));
      const newCost = Math.max(0, Number(stock.total_cost_pyg) - Number(lastOp.total_pyg));
      const newAvg = newAmount > 0 ? newCost / newAmount : 0;
      await supabaseAdmin
        .from('currency_stocks')
        .update({ amount: newAmount, total_cost_pyg: newCost, average_cost: newAvg })
        .eq('currency', lastOp.currency);
    }
  } else if (lastOp.type === 'VENTA' && lastOp.currency && lastOp.amount && lastOp.rate) {
    const { data: acc } = await supabaseAdmin.from('accounts').select('balance').eq('id', lastOp.account).single();
    if (acc) {
      await supabaseAdmin
        .from('accounts')
        .update({ balance: Number(acc.balance) - Number(lastOp.total_pyg) })
        .eq('id', lastOp.account);
    }
    const cashAcc = `Efectivo ${lastOp.currency}`;
    const { data: cash } = await supabaseAdmin.from('accounts').select('balance').eq('id', cashAcc).single();
    if (cash) {
      await supabaseAdmin
        .from('accounts')
        .update({ balance: Number(cash.balance) + Number(lastOp.amount) })
        .eq('id', cashAcc);
    }
    const { data: stock } = await supabaseAdmin.from('currency_stocks').select('*').eq('currency', lastOp.currency).single();
    if (stock) {
      const costOfSold = (Number(lastOp.rate) - (Number(lastOp.profit) || 0) / Number(lastOp.amount)) * Number(lastOp.amount);
      const newAmount = Number(stock.amount) + Number(lastOp.amount);
      const newCost = Number(stock.total_cost_pyg) + costOfSold;
      const newAvg = newAmount > 0 ? newCost / newAmount : 0;
      await supabaseAdmin
        .from('currency_stocks')
        .update({ amount: newAmount, total_cost_pyg: newCost, average_cost: newAvg })
        .eq('currency', lastOp.currency);
    }
  } else if (lastOp.type === 'GASTO') {
    const { data: acc } = await supabaseAdmin.from('accounts').select('balance').eq('id', lastOp.account).single();
    if (acc) {
      await supabaseAdmin
        .from('accounts')
        .update({ balance: Number(acc.balance) + Number(lastOp.total_pyg) })
        .eq('id', lastOp.account);
    }
  }

  await supabaseAdmin.from('transactions').delete().eq('id', lastOp.id);

  let undoMsg = `🗑️ *Operación #${lastOp.operation_number} Anulada con éxito!*\n`;
  undoMsg += `• Tipo: ${lastOp.type}\n`;
  undoMsg += `• Total revertido: ${formatPYG(Number(lastOp.total_pyg))}\n`;
  undoMsg += `• Cuenta: ${lastOp.account}\n`;
  undoMsg += `Todos los saldos y stocks han vuelto a su estado anterior.`;

  return {
    success: true,
    message: undoMsg,
    opNumber: lastOp.operation_number,
  };
}
