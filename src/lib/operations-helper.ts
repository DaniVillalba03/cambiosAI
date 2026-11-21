import { supabaseAdmin } from '@/lib/supabase';
import { formatPYG, formatCurrency } from '@/lib/utils';
import { CURRENCY_FLAGS, CURRENCY_SYMBOLS, CURRENCY_LABELS, Currency, Operation, BANK_ACCOUNTS, OWNER_NAME } from '@/types';
import { isTodayPY, formatLongDatePY } from '@/lib/time';
import { deleteLastOperation } from '@/lib/operations-server';

/**
 * Genera el texto del Cierre de Caja / Resumen del Día
 * consultando directamente la base de datos de Supabase.
 */
export async function generateDailySummaryMessage(): Promise<string> {
  const { data: accounts } = await supabaseAdmin.from('accounts').select('*');
  const { data: stocks } = await supabaseAdmin.from('currency_stocks').select('*');
  // Solo las últimas 48 h: suficiente para "hoy" sin traer todo el historial
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const { data: transactions } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .gte('timestamp', since);

  const todayOps = (transactions || []).filter((tx: any) => isTodayPY(tx.timestamp));

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

  let msg = `📊 *CIERRE DE CAJA - MiCambio*\n`;
  msg += `📅 ${formatLongDatePY(new Date(), true)}\n`;
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
      .filter((a: any) => a.type === 'BANK' && (BANK_ACCOUNTS as string[]).includes(a.id))
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
  msg += `¡Hola, ${OWNER_NAME}! Soy tu asistente cambiario.\n`;
  msg += `Podés escribirme, mandarme fotos de comprobantes o notas de voz:\n\n`;

  msg += `💵 *1. REGISTRAR COMPRAS Y VENTAS*\n`;
  msg += `• _"Compré 500 dólares a 7750 por Itaú"_\n`;
  msg += `• _"Vendí 200 USD a 7820 en efectivo"_\n`;
  msg += `• _"Compré 2000 reales a 1520 con Itaú"_\n`;
  msg += `• _"500 usd a 7750 itau"_ (modo rápido)\n\n`;

  msg += `⛽ *2. REGISTRAR GASTOS*\n`;
  msg += `• _"Gasté 150 mil en combustible con Itaú"_\n`;
  msg += `• _"Pagué 80 mil almuerzo en efectivo"_\n\n`;

  msg += `📸 *3. FOTOS DE COMPROBANTES*\n`;
  msg += `• Enviá la foto de una transferencia bancaria (SIPAP, Itaú, Familiar, BNF, Continental) y extraigo automáticamente el monto, banco y concepto.\n\n`;

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
  msg += `📅 ${formatLongDatePY()}\n`;
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
      .filter((a: any) => a.type === 'BANK' && (BANK_ACCOUNTS as string[]).includes(a.id))
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
  msg += `📅 ${formatLongDatePY()}\n`;
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
 * Anula la última operación registrada y revierte saldos y stock
 * (usa la misma lógica que el botón eliminar de la web).
 */
export async function undoLastOperationMessage(): Promise<{
  success: boolean;
  message: string;
  opNumber?: number;
}> {
  const op = await deleteLastOperation();
  if (!op) {
    return { success: false, message: '⚠️ No hay operaciones registradas para anular.' };
  }

  const lines = [
    `🗑️ *Operación #${op.operationNumber} anulada*`,
    `• Tipo: ${op.type}`,
    `• Total revertido: ${formatPYG(op.totalPYG)}`,
    `• Cuenta: ${op.account}`,
    'Los saldos y el stock volvieron a su estado anterior.',
  ];
  return { success: true, message: lines.join('\n'), opNumber: op.operationNumber };
}

export type BotCommand = 'ayuda' | 'saldos' | 'stock' | 'resumen' | 'anular';

/** Ejecuta un comando del bot y devuelve el texto de respuesta. */
export async function runCommand(command: string): Promise<string> {
  switch (command) {
    case 'ayuda':
      return generateHelpMessage();
    case 'saldos':
      return generateBalancesMessage();
    case 'stock':
      return generateStocksMessage();
    case 'resumen':
      return generateDailySummaryMessage();
    case 'anular':
      return (await undoLastOperationMessage()).message;
    default:
      return generateHelpMessage();
  }
}

/** Mensaje de confirmación de una operación registrada (WhatsApp y chat web). */
export function formatOperationConfirmation(
  op: Operation,
  opts: { warnings?: string[]; isReceipt?: boolean; transcription?: string } = {}
): string {
  const lines: string[] = [];
  if (opts.transcription) lines.push(`🎙️ _"${opts.transcription}"_`, '');
  lines.push(
    opts.isReceipt
      ? `🧾 *Comprobante #${op.operationNumber} registrado*`
      : `✅ *Operación #${op.operationNumber} guardada*`,
    ''
  );

  if (op.type === 'GASTO') {
    lines.push(`📋 *Tipo:* ${opts.isReceipt ? 'Transferencia / Pago' : 'Gasto'}`);
    lines.push(`💰 *Monto:* ${formatPYG(op.totalPYG)}`);
    if (op.description) lines.push(`📝 *Detalle:* ${op.description}`);
    lines.push(`🏦 *Cuenta:* ${op.account}`);
  } else if (op.currency) {
    lines.push(`📋 *Tipo:* ${op.type === 'COMPRA' ? '🔵 Compra' : '🟡 Venta'}`);
    lines.push(`${CURRENCY_FLAGS[op.currency]} *Divisa:* ${CURRENCY_LABELS[op.currency]} (${op.currency})`);
    lines.push(`💵 *Monto:* ${CURRENCY_SYMBOLS[op.currency]} ${formatCurrency(op.amount || 0)}`);
    lines.push(`📊 *Cotización:* Gs. ${formatCurrency(op.rate || 0, op.currency === 'ARS' ? 1 : 0)}`);
    lines.push(`💰 *Total:* ${formatPYG(op.totalPYG)}`);
    lines.push(`🏦 *Cuenta:* ${op.account}`);
    if (op.profit !== undefined) {
      lines.push('', `${op.profit >= 0 ? '🟢' : '🔴'} *Ganancia:* ${op.profit >= 0 ? '+' : ''}${formatPYG(op.profit)}`);
    }
  }

  if (opts.warnings && opts.warnings.length > 0) {
    lines.push('', ...opts.warnings.map((w) => `⚠️ ${w}`));
  }
  lines.push('', '_Escribí *anular* si te equivocaste._');
  return lines.join('\n');
}
