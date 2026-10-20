import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { parseOperationWithAIOrFallback } from '@/lib/agent-service';
import { detectCommand } from '@/lib/local-parser';
import {
  generateDailySummaryMessage,
  undoLastOperationMessage,
  generateHelpMessage,
  generateBalancesMessage,
  generateStocksMessage,
} from '@/lib/operations-helper';

import { formatPYG, formatCurrency, generateId } from '@/lib/utils';
import { CURRENCY_FLAGS, CURRENCY_SYMBOLS, CURRENCY_LABELS } from '@/types';

// Forzar que la ruta sea dinámica (nunca cacheada/prerendered)
export const dynamic = 'force-dynamic';

// Máximo tiempo de ejecución en Vercel (60s Pro, 10s Hobby — Vercel trunca al máximo permitido)
export const maxDuration = 60;

interface ExtractedMessage {
  from: string;
  type: string;
  text: string;
  phoneNumberId: string;
  messageId: string;
  mediaId?: string;
  mimeType?: string;
}

/**
 * Extrae de forma segura y completa el mensaje entrante desde cualquier variante del payload de Meta:
 * - Mensajes de texto
 * - Comprobantes de pago / imágenes (captions e ID de imagen)
 * - Notas de voz / audios (ID de audio y mimeType)
 * - Documentos PDF
 * - Botones y respuestas interactivas
 */
function extractWhatsAppMessage(body: any): ExtractedMessage | null {
  if (!body) return null;

  // 1. Estructura estándar de Meta Webhook (entry -> changes -> value -> messages)
  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change.value;
      if (!value) continue;

      const metadata = value.metadata;
      const rawPhoneId = metadata?.phone_number_id;
      const phoneNumberId =
        rawPhoneId && rawPhoneId !== '123456123'
          ? rawPhoneId
          : process.env.WHATSAPP_PHONE_NUMBER_ID || '';
      const messages = Array.isArray(value.messages) ? value.messages : [];

      for (const msg of messages) {
        if (!msg) continue;
        const from = msg.from || value.contacts?.[0]?.wa_id || '';
        const msgType = msg.type || 'text';
        const messageId = msg.id || '';

        let text = '';
        let mediaId = '';
        let mimeType = '';

        if (typeof msg.text === 'string') {
          text = msg.text;
        } else if (msg.text?.body) {
          text = msg.text.body;
        } else if (typeof msg.body === 'string') {
          text = msg.body;
        } else if (msgType === 'image') {
          text = msg.image?.caption || (typeof msg.caption === 'string' ? msg.caption : '');
          mediaId = msg.image?.id || '';
          mimeType = msg.image?.mime_type || 'image/jpeg';
        } else if (msgType === 'audio' || msgType === 'voice') {
          mediaId = msg.audio?.id || msg.voice?.id || '';
          mimeType = msg.audio?.mime_type || msg.voice?.mime_type || 'audio/ogg';
        } else if (msgType === 'document') {
          text = msg.document?.caption || '';
          mediaId = msg.document?.id || '';
          mimeType = msg.document?.mime_type || 'application/pdf';
        } else if (msgType === 'interactive') {
          text =
            msg.interactive?.button_reply?.title ||
            msg.interactive?.list_reply?.title ||
            msg.interactive?.button_reply?.id ||
            '';
        } else if (msgType === 'button') {
          text = msg.button?.text || '';
        }

        return {
          from,
          type: msgType,
          text: text.trim(),
          phoneNumberId,
          messageId,
          mediaId: mediaId || undefined,
          mimeType: mimeType || undefined,
        };
      }
    }
  }

  // 2. Estructura semi-plana (body.messages[0])
  if (body.messages && Array.isArray(body.messages) && body.messages[0]) {
    const msg = body.messages[0];
    const from = msg.from || body.contacts?.[0]?.wa_id || '';
    const text = (typeof msg.text === 'string' ? msg.text : msg.text?.body || msg.caption || msg.body || '').trim();
    const msgType = msg.type || 'text';
    const mediaId = msg.image?.id || msg.audio?.id || msg.voice?.id || msg.document?.id || '';
    const mimeType = msg.image?.mime_type || msg.audio?.mime_type || msg.voice?.mime_type || msg.document?.mime_type || '';

    return {
      from,
      type: msgType,
      text,
      phoneNumberId: body.metadata?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      messageId: msg.id || '',
      mediaId: mediaId || undefined,
      mimeType: mimeType || undefined,
    };
  }

  // 3. Estructura directa para pruebas HTTP (body.text)
  if (typeof body.text === 'string' || body.text?.body || body.message) {
    const from = body.from || body.phone || '595983390832';
    const text = typeof body.text === 'string' ? body.text : (body.text?.body || body.message || '');
    return {
      from,
      type: 'text',
      text: String(text).trim(),
      phoneNumberId: body.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      messageId: body.id || 'direct_test',
    };
  }

  return null;
}

/**
 * Descarga archivos multimedia (comprobantes en imagen o notas de voz en audio)
 * directamente desde la CDN de Meta WhatsApp Cloud API usando el mediaId.
 */
async function downloadWhatsAppMedia(mediaId: string): Promise<{ base64: string; mimeType: string } | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !mediaId) return null;

  try {
    // 1. Obtener URL de descarga del archivo desde Graph API
    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!metaRes.ok) {
      console.error('❌ [MEDIA] Error obteniendo URL del medio:', await metaRes.text());
      return null;
    }

    const metaData = await metaRes.json();
    const mediaUrl = metaData.url;
    const mimeType = metaData.mime_type || 'image/jpeg';

    if (!mediaUrl) {
      console.error('❌ [MEDIA] Metadata no contiene URL de descarga');
      return null;
    }

    // 2. Descargar los bytes binarios desde la CDN de Facebook
    const fileRes = await fetch(mediaUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'curl/7.64.1',
      },
    });

    if (!fileRes.ok) {
      console.error('❌ [MEDIA] Error descargando binario de Meta CDN:', await fileRes.text());
      return null;
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return {
      base64: buffer.toString('base64'),
      mimeType,
    };
  } catch (error) {
    console.error('❌ [MEDIA] Excepción descargando medio de Meta:', error);
    return null;
  }
}

/**
 * Envía un mensaje de texto formateado a través de Meta WhatsApp Cloud API
 */
async function sendWhatsAppMessage(to: string, text: string, phoneNumberId?: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const envPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const isDummyId = !phoneNumberId || phoneNumberId === '123456123' || phoneNumberId.length < 10;
  const targetPhoneId = isDummyId ? envPhoneId : phoneNumberId;

  if (!token || !targetPhoneId) {
    console.warn(`[WhatsApp Notice] Falta WHATSAPP_ACCESS_TOKEN o phone_number_id (destinatario: ${to})`);
    console.log(`Mensaje formateado listo para enviar:\n${text}`);
    return { success: false, reason: 'missing_credentials' };
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
      return { success: false, error: resJson };
    } else {
      console.log(`✅ Respuesta enviada con éxito a WhatsApp (${cleanTo}) usando phone_number_id (${targetPhoneId})`);
      return { success: true, data: resJson };
    }
  } catch (error) {
    console.error('❌ Excepción enviando a Meta WhatsApp Cloud API:', error);
    console.error(`- Phone Number ID usado: ${targetPhoneId}`);
    console.error(`- Destinatario (to): ${cleanTo}`);
    return { success: false, error };
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
  // ⚡ Log inmediato — esto DEBE aparecer en Vercel logs siempre
  console.log('🔔 [WEBHOOK POST] Request recibida en /api/whatsapp/webhook');

  let rawBody: string;
  try {
    rawBody = await request.text();
    console.log(`📦 [WEBHOOK] Body length: ${rawBody?.length || 0} bytes`);
  } catch (readErr) {
    console.error('❌ [WEBHOOK] Error leyendo body:', readErr);
    return NextResponse.json({ status: 'read_error' }, { status: 200 });
  }

  if (!rawBody) {
    console.log('⚠️ [WEBHOOK] Body vacío, respondiendo 200');
    return NextResponse.json({ status: 'empty_body' }, { status: 200 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.log('⚠️ [WEBHOOK] JSON inválido, respondiendo 200');
    return NextResponse.json({ status: 'invalid_json' }, { status: 200 });
  }

  // Extraer mensaje del payload anidado de Meta
  const incoming = extractWhatsAppMessage(body);

  // Si es notificación de estado (sent, delivered, read) y no hay mensajes nuevos, responder siempre 200
  if (!incoming) {
    console.log('📝 [WEBHOOK] No hay mensaje nuevo (status update o payload vacío)');
    return NextResponse.json(
      { status: 'acknowledged_status_or_empty', handled: true },
      { status: 200 }
    );
  }

  const { from, type: msgType, text, phoneNumberId, mediaId, mimeType } = incoming;
  console.log(`📱 WhatsApp mensaje recibido de ${from} (phone_id: ${phoneNumberId}): "${text}" (tipo: ${msgType}, mediaId: ${mediaId || 'none'})`);

  // ✅ Responder 200 INMEDIATAMENTE a Meta y procesar en background con after()
  // Esto evita que Meta haga timeout y deje de enviar mensajes al webhook
  after(async () => {
    try {
      console.log(`🔄 [AFTER] Procesando mensaje de ${from} en background...`);

      const isAudio = msgType === 'audio' || msgType === 'voice';
      const isImage = msgType === 'image' || msgType === 'document';

      let mediaData: { base64: string; mimeType: string } | null = null;
      if (mediaId) {
        console.log(`📥 [AFTER] Descargando medio (${msgType}) id: ${mediaId}...`);
        mediaData = await downloadWhatsAppMedia(mediaId);
        if (mediaData) {
          console.log(`✅ [AFTER] Medio descargado con éxito (${mediaData.mimeType}, ${mediaData.base64.length} chars)`);
        } else {
          console.warn('⚠️ [AFTER] No se pudo descargar el medio de Meta');
        }
      }

      // Si no hay texto ni medio que analizar (por ejemplo sticker o reacción)
      if (!text && !mediaData) {
        console.log('📝 [AFTER] Sin texto ni multimedia procesable, ignorando');
        return;
      }

      // ─── COMANDOS DIRECTOS POR TEXTO (AYUDA / SALDOS / STOCK / RESUMEN / ANULAR) ───
      if (text && !mediaData) {
        const cmd = detectCommand(text);
        if (cmd.isCommand && cmd.command) {
          if (cmd.command === 'ayuda') {
            const helpMsg = generateHelpMessage();
            await sendWhatsAppMessage(from, helpMsg, phoneNumberId);
            console.log('✅ [AFTER] Ayuda enviada a WhatsApp');
            return;
          }
          if (cmd.command === 'saldos') {
            const balancesMsg = await generateBalancesMessage();
            await sendWhatsAppMessage(from, balancesMsg, phoneNumberId);
            console.log('✅ [AFTER] Saldos enviados a WhatsApp');
            return;
          }
          if (cmd.command === 'stock') {
            const stocksMsg = await generateStocksMessage();
            await sendWhatsAppMessage(from, stocksMsg, phoneNumberId);
            console.log('✅ [AFTER] Stock enviado a WhatsApp');
            return;
          }
          if (cmd.command === 'resumen') {
            const summaryMsg = await generateDailySummaryMessage();
            await sendWhatsAppMessage(from, summaryMsg, phoneNumberId);
            console.log('✅ [AFTER] Resumen enviado a WhatsApp');
            return;
          }
          if (cmd.command === 'anular') {
            const undoResult = await undoLastOperationMessage();
            await sendWhatsAppMessage(from, undoResult.message, phoneNumberId);
            console.log('✅ [AFTER] Anulación procesada en WhatsApp');
            return;
          }
        }
      }

      // ─── PROCESAR CON IA MULTIMODAL (TEXTO / IMAGEN / AUDIO) ───
      console.log(`💬 [AFTER] Procesando con IA (tipo: ${msgType}, texto: "${text || ''}")`);
      const parseResult = await parseOperationWithAIOrFallback(text, {
        audioBase64: isAudio ? mediaData?.base64 : undefined,
        audioMimeType: isAudio ? mediaData?.mimeType : undefined,
        imageBase64: isImage ? mediaData?.base64 : undefined,
        imageMimeType: isImage ? mediaData?.mimeType : undefined,
      });

      if (!parseResult.success || !parseResult.operation) {
        console.warn(`⚠️ [AFTER] No se pudo interpretar el mensaje/medio:`, text);
        const helpMsg = isAudio
          ? `🎙️ No pude entender con claridad tu nota de voz.\n\nPor favor repetí el audio o escribílo en texto (ej: *"Compré 500 dólares a 7750 con Ueno"*).\n\n💡 Escribí *ayuda* para ver la lista de comandos disponibles.`
          : isImage
          ? `🧾 Recibí la imagen, pero no pude extraer con claridad los datos del comprobante.\n\nAsegurate de que se vea bien el monto, banco y fecha, o escribí los datos en texto.`
          : `❓ No pude entender la operación.\n\n💡 Escribí *ayuda* para ver todos los comandos y ejemplos disponibles.\n\nEjemplos rápidos:\n• *"Compré 500 dólares a 7750 con Ueno"*\n• *"Vendí 200 USD a 7820 en efectivo"*\n• *"Gasté 50 mil en combustible con Itaú"*\n• *saldos* (ver dinero en bancos)\n• *stock* (ver billetes en mano)\n• *resumen* (ver cierre del día)\n• *anular* (deshacer la última)`;

        await sendWhatsAppMessage(from, helpMsg, phoneNumberId);
        return;
      }

      // Si el audio o mensaje detectó un comando (ej. en audio dijo "haceme el resumen del día" o "cuánto dinero tengo")
      if (parseResult.isCommand && parseResult.command) {
        const intro = parseResult.transcription ? `🎙️ _"${parseResult.transcription}"_\n\n` : '';
        if (parseResult.command === 'ayuda') {
          const helpMsg = generateHelpMessage();
          await sendWhatsAppMessage(from, intro + helpMsg, phoneNumberId);
          return;
        }
        if (parseResult.command === 'saldos') {
          const balancesMsg = await generateBalancesMessage();
          await sendWhatsAppMessage(from, intro + balancesMsg, phoneNumberId);
          return;
        }
        if (parseResult.command === 'stock') {
          const stocksMsg = await generateStocksMessage();
          await sendWhatsAppMessage(from, intro + stocksMsg, phoneNumberId);
          return;
        }
        if (parseResult.command === 'resumen') {
          const summaryMsg = await generateDailySummaryMessage();
          await sendWhatsAppMessage(from, intro + summaryMsg, phoneNumberId);
          console.log('✅ [AFTER] Resumen por voz enviado');
          return;
        }
        if (parseResult.command === 'anular') {
          const undoResult = await undoLastOperationMessage();
          await sendWhatsAppMessage(from, intro + undoResult.message, phoneNumberId);
          console.log('✅ [AFTER] Anulación por voz procesada');
          return;
        }
      }


      const parsed = parseResult.operation;
      const targetAccount = parsed.account || 'Efectivo PYG';
      console.log(`🤖 [AFTER] Operación interpretada (${parseResult.source}):`, JSON.stringify(parsed));

      let nextOpNumber = 1;
      let profit: number | null = null;
      const opId = generateId();

      // ─── PERSISTENCIA EN SUPABASE CON PROTECCIÓN DE EXCEPCIONES ───
      try {
        // 1. Obtener siguiente número de operación
        const { data: maxOpData } = await supabaseAdmin
          .from('transactions')
          .select('operation_number')
          .order('operation_number', { ascending: false })
          .limit(1);

        nextOpNumber = maxOpData && maxOpData.length > 0 ? Number(maxOpData[0].operation_number) + 1 : 1;

        if (parsed.type === 'COMPRA' && parsed.currency && parsed.amount && parsed.rate) {
          const totalPYG = Math.round(parsed.amount * parsed.rate);

          // Actualizar cuenta PYG
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

          // Actualizar efectivo en divisa
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

          // Actualizar stock y PPP
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

          // Actualizar cuenta PYG
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

          // Actualizar efectivo en divisa
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

          // Reducir stock y costo
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
          console.error('❌ [AFTER] Error guardando transacción en Supabase:', txErr);
        } else {
          console.log(`💾 [AFTER] Transacción #${nextOpNumber} guardada en Supabase con éxito`);
        }
      } catch (dbError) {
        console.error('⚠️ [AFTER] Excepción interactuando con Supabase:', dbError);
      }

      // ─── FORMATEAR MENSAJE DE CONFIRMACIÓN ───
      let confirmMsg = '';

      if (isAudio && parseResult.transcription) {
        confirmMsg += `🎙️ _"${parseResult.transcription}"_\n\n`;
      }

      if (isImage) {
        confirmMsg += `🧾 *¡Comprobante #${nextOpNumber} Registrado!*\n\n`;
      } else {
        confirmMsg += `✅ *¡Operación #${nextOpNumber} Guardada!*\n\n`;
      }

      if (parsed.type === 'GASTO') {
        confirmMsg += `📋 *Tipo:* ${isImage ? 'Transferencia / Pago' : 'Gasto Operativo'}\n`;
        confirmMsg += `💰 *Monto:* ${formatPYG(parsed.totalPYG || 0)}\n`;
        if (parsed.description) confirmMsg += `📝 *Detalle:* ${parsed.description}\n`;
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

      // ─── ENVIAR MENSAJE DE VUELTA A WHATSAPP VIA API GRAPH ───
      const sendResult = await sendWhatsAppMessage(from, confirmMsg, phoneNumberId);
      console.log(`✅ [AFTER] Procesamiento completo para ${from}. Envío WhatsApp:`, sendResult?.success ? 'OK' : 'FALLÓ');

    } catch (afterError) {
      console.error('❌ [AFTER] Excepción en procesamiento background:', afterError);
      // Intentar notificar al usuario del error
      try {
        await sendWhatsAppMessage(from, '⚠️ Hubo un problema procesando tu mensaje. Por favor intentá de nuevo.', phoneNumberId);
      } catch {
        console.error('❌ [AFTER] No se pudo enviar mensaje de error al usuario');
      }
    }
  });

  // ─── RESPONDER 200 INMEDIATAMENTE A META ───
  // El procesamiento real ocurre en after() arriba
  return NextResponse.json(
    { status: 'received', message: 'Webhook received, processing in background' },
    { status: 200 }
  );
}
