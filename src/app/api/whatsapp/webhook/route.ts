import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { parseOperationWithAIOrFallback } from '@/lib/agent-service';
import { formatPYG, formatCurrency, generateId } from '@/lib/utils';
import { CURRENCIES, CURRENCY_FLAGS, CURRENCY_SYMBOLS, CURRENCY_LABELS, Currency } from '@/types';

/**
 * Envía un mensaje de texto formateado a través de Meta WhatsApp Cloud API
 */
async function sendWhatsAppMessage(to: string, text: string, phoneNumberId?: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const targetPhoneId = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !targetPhoneId) {
    console.warn(`[WhatsApp Notice] Falta WHATSAPP_ACCESS_TOKEN o phone_number_id (to: ${to})`);
    console.log(`Mensaje no enviado a API Graph:\n${text}`);
    return;
  }

  // Limpiar número del destinatario (solo dígitos)
  const cleanTo = to.replace(/\D/g, '');
  const endpoint = `https://graph.facebook.com/v22.0/${targetPhoneId}/messages`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        type: 'text',
        text: {
          preview_url: false,
          body: text,
        },
      }),
    });

    const resJson = await res.json().catch(() => null);

    if (!res.ok) {
      console.error('❌ Error respondiendo a Meta WhatsApp Cloud API:');
      console.error(`- Endpoint: ${endpoint}`);
      console.error(`- Phone Number ID usado: ${targetPhoneId}`);
      console.error(`- Destinatario (to): ${cleanTo}`);
      console.error('- Respuesta Graph API:', JSON.stringify(resJson, null, 2));
    } else {
      console.log(`✅ Respuesta enviada con éxito a WhatsApp (${cleanTo}) usando phone_number_id (${targetPhoneId})`);
    }
  } catch (error) {
    console.error('❌ Excepción enviando a Meta WhatsApp Cloud API:', error);
    console.error(`- Phone Number ID usado: ${targetPhoneId}`);
    console.error(`- Destinatario (to): ${cleanTo}`);
  }
}

// 1. GET: Verificación del Webhook de Meta
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'cambios_papa_2026';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ WhatsApp webhook verified successfully');
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// 2. POST: Recepción de Eventos y Mensajes de WhatsApp
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;

    const metadata = value?.metadata;
    const phoneNumberId = metadata?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;

    console.log('📱 Webhook metadata recibida:', JSON.stringify({
      display_phone_number: metadata?.display_phone_number,
      phone_number_id_recibido: metadata?.phone_number_id,
      phone_number_id_final: phoneNumberId,
      has_messages: Boolean(messages && messages.length > 0),
    }));

    // Si es notificación de estado (sent, delivered, read) y no hay mensajes nuevos, responder 200
    if (!messages || messages.length === 0) {
      return NextResponse.json({ status: 'no_messages' }, { status: 200 });
    }

    const message = messages[0];
    const from = message.from;
    const msgType = message.type;

    let text = '';
    if (msgType === 'text') {
      text = message.text?.body || '';
    } else if (msgType === 'image') {
      text = message.image?.caption || '';
    } else if (msgType === 'audio' || msgType === 'voice') {
      await sendWhatsAppMessage(
        from,
        '🎙️ ¡Hola! Recibí tu nota de voz. Para registrar el cambio con máxima exactitud en este momento, por favor escribílo en texto (por ejemplo: "Compré 500 dólares a 7750 con Ueno").',
        phoneNumberId
      );
      return NextResponse.json({ status: 'audio_notified' }, { status: 200 });
    }

    const trimmed = text.trim().toLowerCase();

    // ─── COMANDO ESPECIAL: RESUMEN / ARQUEO / CIERRE ───
    if (['resumen', 'arqueo', 'cierre'].includes(trimmed)) {
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
      if (stocks) {
        stocks.forEach((s: any) => {
          const cur = s.currency as Currency;
          if (Number(s.amount) > 0) {
            msg += `${CURRENCY_FLAGS[cur] || ''} ${cur}: ${CURRENCY_SYMBOLS[cur] || ''} ${formatCurrency(Number(s.amount), cur === 'ARS' ? 0 : 2)}`;
            msg += ` (PPP: Gs. ${formatCurrency(Number(s.average_cost), 0)})\n`;
          }
        });
      }

      msg += `\n🏦 *SALDOS EN GUARANÍES*\n`;
      if (accounts) {
        const efectivo = accounts.find((a: any) => a.id === 'Efectivo PYG');
        if (efectivo) {
          msg += `💰 Efectivo: ${formatPYG(Number(efectivo.balance))}\n`;
        }
        accounts
          .filter((a: any) => a.type === 'BANK')
          .forEach((b: any) => {
            msg += `🏛️ ${b.name}: ${formatPYG(Number(b.balance))}\n`;
          });
      }

      msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
      msg += `✅ Generado automáticamente por CambiosAI`;

      await sendWhatsAppMessage(from, msg, phoneNumberId);
      return NextResponse.json({ status: 'success', command: 'resumen' });
    }

    // ─── COMANDO ESPECIAL: ANULAR / BORRAR ÚLTIMO ───
    if (['anular', 'borrar ultimo', 'anular ultimo', 'deshacer'].includes(trimmed)) {
      const { data: lastTxs } = await supabaseAdmin
        .from('transactions')
        .select('*')
        .order('operation_number', { ascending: false })
        .limit(1);

      if (!lastTxs || lastTxs.length === 0) {
        await sendWhatsAppMessage(from, '⚠️ No hay operaciones registradas para anular.', phoneNumberId);
        return NextResponse.json({ status: 'no_transactions_to_undo' });
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

      await sendWhatsAppMessage(from, undoMsg, phoneNumberId);
      return NextResponse.json({ status: 'undone', opNumber: lastOp.operation_number });
    }

    // ─── PROCESAR OPERACIÓN CAMBIARIA / GASTO ───
    if (text) {
      console.log(`💬 Procesando texto recibido de ${from}: "${text}"`);
      const parseResult = await parseOperationWithAIOrFallback(text);

      if (!parseResult.success || !parseResult.operation) {
        console.warn(`⚠️ No se pudo interpretar la operación: "${text}"`);
        await sendWhatsAppMessage(
          from,
          `❓ No pude entender la operación.\n\nEjemplos válidos:\n• *"Compré 500 dólares a 7750 con Ueno"*\n• *"Vendí 200 USD a 7820 en efectivo"*\n• *"Gasté 50 mil en combustible con Itaú"*\n• *"resumen"* (para cierre de caja)\n• *"anular"* (para deshacer la última)`,
          phoneNumberId
        );
        return NextResponse.json({ status: 'unrecognized' }, { status: 200 });
      }

      const parsed = parseResult.operation;
      const targetAccount = parsed.account || 'Efectivo PYG';
      console.log(`🤖 Operación interpretada (${parseResult.source}):`, JSON.stringify(parsed));

      // Obtener el siguiente número de operación
      const { data: maxOpData } = await supabaseAdmin
        .from('transactions')
        .select('operation_number')
        .order('operation_number', { ascending: false })
        .limit(1);

      const nextOpNumber = maxOpData && maxOpData.length > 0 ? Number(maxOpData[0].operation_number) + 1 : 1;
      let profit: number | null = null;
      const opId = generateId();

      if (parsed.type === 'COMPRA' && parsed.currency && parsed.amount && parsed.rate) {
        const totalPYG = Math.round(parsed.amount * parsed.rate);

        // 1. Actualizar cuenta PYG
        const { data: acc } = await supabaseAdmin.from('accounts').select('balance').eq('id', targetAccount).single();
        const currentBal = acc ? Number(acc.balance) : 0;
        await supabaseAdmin.from('accounts').upsert({
          id: targetAccount,
          name: targetAccount,
          type: targetAccount.startsWith('Efectivo') ? 'CASH' : 'BANK',
          currency: 'PYG',
          balance: currentBal - totalPYG,
          updated_at: new Date().toISOString(),
        });

        // 2. Actualizar efectivo en divisa
        const cashAcc = `Efectivo ${parsed.currency}`;
        const { data: cash } = await supabaseAdmin.from('accounts').select('balance').eq('id', cashAcc).single();
        const currentCash = cash ? Number(cash.balance) : 0;
        await supabaseAdmin.from('accounts').upsert({
          id: cashAcc,
          name: cashAcc,
          type: 'CASH',
          currency: parsed.currency,
          balance: currentCash + parsed.amount,
          updated_at: new Date().toISOString(),
        });

        // 3. Actualizar stock y PPP
        const { data: stock } = await supabaseAdmin.from('currency_stocks').select('*').eq('currency', parsed.currency).single();
        const curAmount = stock ? Number(stock.amount) : 0;
        const curCost = stock ? Number(stock.total_cost_pyg) : 0;
        const newAmount = curAmount + parsed.amount;
        const newCost = curCost + totalPYG;
        const newAvg = newAmount > 0 ? newCost / newAmount : 0;

        await supabaseAdmin.from('currency_stocks').upsert({
          currency: parsed.currency,
          amount: newAmount,
          total_cost_pyg: newCost,
          average_cost: newAvg,
          updated_at: new Date().toISOString(),
        });
      } else if (parsed.type === 'VENTA' && parsed.currency && parsed.amount && parsed.rate) {
        const totalPYG = Math.round(parsed.amount * parsed.rate);

        // Obtener PPP actual
        const { data: stock } = await supabaseAdmin.from('currency_stocks').select('*').eq('currency', parsed.currency).single();
        const avgCost = stock ? Number(stock.average_cost) : 0;
        profit = Math.round((parsed.rate - avgCost) * parsed.amount);

        // 1. Actualizar cuenta PYG
        const { data: acc } = await supabaseAdmin.from('accounts').select('balance').eq('id', targetAccount).single();
        const currentBal = acc ? Number(acc.balance) : 0;
        await supabaseAdmin.from('accounts').upsert({
          id: targetAccount,
          name: targetAccount,
          type: targetAccount.startsWith('Efectivo') ? 'CASH' : 'BANK',
          currency: 'PYG',
          balance: currentBal + totalPYG,
          updated_at: new Date().toISOString(),
        });

        // 2. Actualizar efectivo en divisa
        const cashAcc = `Efectivo ${parsed.currency}`;
        const { data: cash } = await supabaseAdmin.from('accounts').select('balance').eq('id', cashAcc).single();
        const currentCash = cash ? Number(cash.balance) : 0;
        await supabaseAdmin.from('accounts').upsert({
          id: cashAcc,
          name: cashAcc,
          type: 'CASH',
          currency: parsed.currency,
          balance: Math.max(0, currentCash - parsed.amount),
          updated_at: new Date().toISOString(),
        });

        // 3. Reducir stock y costo
        if (stock) {
          const costOfSold = avgCost * parsed.amount;
          const newAmount = Math.max(0, Number(stock.amount) - parsed.amount);
          const newCost = Math.max(0, Number(stock.total_cost_pyg) - costOfSold);
          const newAvg = newAmount > 0 ? newCost / newAmount : 0;
          await supabaseAdmin.from('currency_stocks').upsert({
            currency: parsed.currency,
            amount: newAmount,
            total_cost_pyg: newCost,
            average_cost: newAvg,
            updated_at: new Date().toISOString(),
          });
        }
      } else if (parsed.type === 'GASTO') {
        const { data: acc } = await supabaseAdmin.from('accounts').select('balance').eq('id', targetAccount).single();
        const currentBal = acc ? Number(acc.balance) : 0;
        await supabaseAdmin.from('accounts').upsert({
          id: targetAccount,
          name: targetAccount,
          type: targetAccount.startsWith('Efectivo') ? 'CASH' : 'BANK',
          currency: 'PYG',
          balance: currentBal - (parsed.totalPYG || 0),
          updated_at: new Date().toISOString(),
        });
      }

      // Guardar en tabla transactions de Supabase
      const { error: txErr } = await supabaseAdmin.from('transactions').insert({
        id: opId,
        operation_number: nextOpNumber,
        timestamp: new Date().toISOString(),
        type: parsed.type,
        currency: parsed.currency || null,
        amount: parsed.amount || null,
        rate: parsed.rate || null,
        total_pyg: parsed.totalPYG || (parsed.amount && parsed.rate ? Math.round(parsed.amount * parsed.rate) : 0),
        account: targetAccount,
        profit,
        description: parsed.description || null,
      });

      if (txErr) {
        console.error('❌ Error guardando transacción en Supabase:', txErr);
      } else {
        console.log(`💾 Transacción #${nextOpNumber} guardada en Supabase con éxito`);
      }

      // 4. Enviar confirmación por WhatsApp
      let confirmMsg = `✅ *¡Operación #${nextOpNumber} Guardada!*\n\n`;

      if (parsed.type === 'GASTO') {
        confirmMsg += `📋 *Tipo:* Gasto Operativo\n`;
        confirmMsg += `💰 *Monto:* ${formatPYG(parsed.totalPYG || 0)}\n`;
        if (parsed.description) confirmMsg += `📝 *Concepto:* ${parsed.description}\n`;
        confirmMsg += `🏦 *Cuenta:* ${targetAccount}\n`;
      } else {
        const flag = parsed.currency ? CURRENCY_FLAGS[parsed.currency] : '';
        const symbol = parsed.currency ? CURRENCY_SYMBOLS[parsed.currency] : '';
        const label = parsed.currency ? CURRENCY_LABELS[parsed.currency] : '';

        confirmMsg += `📋 *Tipo:* ${parsed.type === 'COMPRA' ? '🔵 Compra' : '🟡 Venta'}\n`;
        confirmMsg += `${flag} *Divisa:* ${label} (${parsed.currency})\n`;
        confirmMsg += `💵 *Monto:* ${symbol} ${formatCurrency(parsed.amount || 0)}\n`;
        confirmMsg += `📊 *Cotización:* Gs. ${formatCurrency(parsed.rate || 0, 0)}\n`;
        confirmMsg += `💰 *Total:* ${formatPYG(parsed.totalPYG || (parsed.amount && parsed.rate ? Math.round(parsed.amount * parsed.rate) : 0))}\n`;
        confirmMsg += `🏦 *Cuenta:* ${targetAccount}\n`;

        if (profit !== null && profit !== undefined) {
          confirmMsg += `\n${profit >= 0 ? '🟢' : '🔴'} *Ganancia Cambiaria:* ${profit >= 0 ? '+' : ''}${formatPYG(profit)}`;
        }
      }

      confirmMsg += `\n\n_Sincronizado en tiempo real con CambiosAI Web_`;

      await sendWhatsAppMessage(from, confirmMsg, phoneNumberId);
    }

    return NextResponse.json({ status: 'processed' }, { status: 200 });
  } catch (error) {
    console.error('❌ Error crítico en WhatsApp webhook:', error);
    return NextResponse.json({ status: 'error' }, { status: 200 });
  }
}
