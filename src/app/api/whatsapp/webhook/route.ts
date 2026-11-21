import { NextRequest, NextResponse, after } from 'next/server';
import crypto from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { parseOperationWithAIOrFallback } from '@/lib/agent-service';
import { detectCommand } from '@/lib/local-parser';
import { runCommand, formatOperationConfirmation } from '@/lib/operations-helper';
import {
  recordOperation,
  validateParsedOperation,
  type ValidatedOperation,
  type OperationMeta,
} from '@/lib/operations-server';

// Forzar que la ruta sea dinámica (nunca cacheada/prerendered)
export const dynamic = 'force-dynamic';

// Máximo tiempo de ejecución en Vercel
export const maxDuration = 60;

const GRAPH_VERSION = 'v22.0';

interface ExtractedMessage {
  from: string;
  type: string;
  text: string;
  phoneNumberId: string;
  messageId: string;
  mediaId?: string;
  mimeType?: string;
  /** Nombre del perfil de WhatsApp de quien escribe (para saber quién anotó) */
  profileName?: string;
  /** id del botón tocado (respuestas a "Guardar / Cancelar") */
  buttonId?: string;
}

/**
 * Extrae el mensaje entrante del payload de Meta:
 * texto, imágenes (comprobantes), audios, documentos y botones interactivos.
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

      const rawPhoneId = value.metadata?.phone_number_id;
      const phoneNumberId =
        rawPhoneId && rawPhoneId !== '123456123'
          ? rawPhoneId
          : process.env.WHATSAPP_PHONE_NUMBER_ID || '';
      const messages = Array.isArray(value.messages) ? value.messages : [];

      for (const msg of messages) {
        if (!msg) continue;
        const from = msg.from || value.contacts?.[0]?.wa_id || '';
        const msgType = msg.type || 'text';

        let text = '';
        let mediaId = '';
        let mimeType = '';
        const contact = (value.contacts || []).find((c: any) => c?.wa_id === from) || value.contacts?.[0];
        const profileName: string | undefined = contact?.profile?.name || undefined;
        const buttonId: string | undefined = msg.interactive?.button_reply?.id || undefined;

        if (typeof msg.text === 'string') {
          text = msg.text;
        } else if (msg.text?.body) {
          text = msg.text.body;
        } else if (msgType === 'image') {
          text = msg.image?.caption || '';
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
          messageId: msg.id || '',
          mediaId: mediaId || undefined,
          mimeType: mimeType || undefined,
          profileName,
          buttonId,
        };
      }
    }
  }

  // 2. Estructura directa para pruebas HTTP locales (body.text). Deshabilitada en producción:
  //    permitiría a cualquiera registrar operaciones con un simple POST.
  if (
    process.env.NODE_ENV !== 'production' &&
    (typeof body.text === 'string' || body.text?.body || body.message)
  ) {
    const text = typeof body.text === 'string' ? body.text : body.text?.body || body.message || '';
    return {
      from: body.from || 'test',
      type: 'text',
      text: String(text).trim(),
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
      messageId: 'direct_test',
    };
  }

  return null;
}

/**
 * fetch con reintentos ante errores de red, 429 o 5xx de Meta (fallos momentáneos).
 * No reintenta errores 4xx "reales" (token inválido, número no permitido, etc.).
 */
async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
      if (res.status !== 429 && res.status < 500) return res;
      lastError = new Error(`HTTP ${res.status}`);
      if (i === attempts - 1) return res;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 600 * (i + 1)));
  }
  throw lastError;
}

/**
 * Descarga archivos multimedia (comprobantes o notas de voz) desde Meta usando el mediaId.
 */
async function downloadWhatsAppMedia(mediaId: string): Promise<{ base64: string; mimeType: string } | null> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token || !mediaId) return null;

  try {
    const metaRes = await fetchWithRetry(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) {
      console.error('❌ [MEDIA] Error obteniendo URL del medio:', await metaRes.text());
      return null;
    }

    const metaData = await metaRes.json();
    if (!metaData.url) return null;

    const fileRes = await fetchWithRetry(metaData.url, {
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'curl/7.64.1' },
    });
    if (!fileRes.ok) {
      console.error('❌ [MEDIA] Error descargando binario de Meta:', fileRes.status);
      return null;
    }

    const buffer = Buffer.from(await fileRes.arrayBuffer());
    return { base64: buffer.toString('base64'), mimeType: metaData.mime_type || 'image/jpeg' };
  } catch (error) {
    console.error('❌ [MEDIA] Excepción descargando medio de Meta:', error);
    return null;
  }
}

/** Envía un mensaje de texto por WhatsApp. */
function sendWhatsAppMessage(to: string, text: string, phoneNumberId?: string) {
  return sendWhatsAppPayload(to, { type: 'text', text: { preview_url: false, body: text } }, phoneNumberId);
}

/** Envía un mensaje con botones de respuesta rápida (máx. 3 botones, 20 caracteres cada uno). */
function sendWhatsAppButtons(
  to: string,
  text: string,
  buttons: { id: string; title: string }[],
  phoneNumberId?: string
) {
  return sendWhatsAppPayload(
    to,
    {
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: text.slice(0, 1024) },
        action: { buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })) },
      },
    },
    phoneNumberId
  );
}

async function sendWhatsAppPayload(to: string, message: Record<string, unknown>, phoneNumberId?: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const isDummyId = !phoneNumberId || phoneNumberId === '123456123' || phoneNumberId.length < 10;
  const targetPhoneId = isDummyId ? process.env.WHATSAPP_PHONE_NUMBER_ID : phoneNumberId;

  if (!token || !targetPhoneId) {
    console.warn(`[WhatsApp] Falta WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID. Mensaje para ${to}:`, message);
    return { success: false, reason: 'missing_credentials' };
  }

  const cleanTo = to.replace(/\D/g, '');
  try {
    const res = await fetchWithRetry(`https://graph.facebook.com/${GRAPH_VERSION}/${targetPhoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanTo,
        ...message,
      }),
    });
    const resJson = await res.json().catch(() => null);
    if (!res.ok) {
      // Código 190 = token vencido; 131030 = número no está en la lista de prueba
      console.error(`❌ [WhatsApp] Error enviando a ${cleanTo}:`, JSON.stringify(resJson));
      return { success: false, error: resJson };
    }
    return { success: true, data: resJson };
  } catch (error) {
    console.error('❌ [WhatsApp] Excepción enviando mensaje:', error);
    return { success: false, error };
  }
}

/**
 * Verifica la firma X-Hub-Signature-256 que Meta agrega a cada webhook.
 * Si WHATSAPP_APP_SECRET no está configurado se acepta igual (con advertencia).
 */
function isValidSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.warn('⚠️ [WEBHOOK] WHATSAPP_APP_SECRET no configurado: no se verifica la firma de Meta');
    return true;
  }
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const received = header.slice('sha256='.length);
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}

/** Solo los números de WHATSAPP_ALLOWED_NUMBERS (si está definido) pueden usar el bot. */
function isAllowedSender(from: string): boolean {
  const list = (process.env.WHATSAPP_ALLOWED_NUMBERS || '')
    .split(',')
    .map((n) => n.replace(/\D/g, ''))
    .filter(Boolean);
  if (list.length === 0) return true;
  return list.includes(from.replace(/\D/g, ''));
}

/**
 * Meta reintenta el webhook si no recibe 200 a tiempo. Para no registrar la misma
 * operación dos veces guardamos el id del mensaje en `processed_messages`.
 * Devuelve false si el mensaje ya se procesó.
 */
async function claimMessage(messageId: string): Promise<boolean> {
  if (!messageId || messageId === 'direct_test') return true;
  const { error } = await supabaseAdmin.from('processed_messages').insert({ id: messageId });
  if (!error) return true;
  if (error.code === '23505') return false; // duplicado
  console.warn('⚠️ [WEBHOOK] No se pudo usar processed_messages (¿falta la tabla?):', error.message);
  return true;
}

/** Marca el mensaje como leído y muestra "escribiendo..." mientras se procesa. */
async function markAsReadWithTyping(messageId: string, phoneNumberId: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId || !messageId || messageId === 'direct_test') return;
  try {
    await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: { type: 'text' },
      }),
    });
  } catch {
    // No es crítico
  }
}

// ─── Comprobantes pendientes de confirmación ("Guardar / Cancelar") ───

const PENDING_TTL_MS = 60 * 60 * 1000; // 1 hora para confirmar
const YES_RE = /^(si|s|ok|dale|guardar|guardalo|guarda|confirmo|confirmar|correcto|esta bien)$/;
const NO_RE = /^(no|n|cancelar|cancela|descartar|borralo|esta mal)$/;

interface PendingPayload {
  op: ValidatedOperation;
  meta: OperationMeta;
  transcription?: string;
}

const normalizeReply = (t: string) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, '')
    .trim();

/** Guarda el comprobante leído hasta que la persona confirme. Un solo pendiente por persona. */
async function savePending(sender: string, payload: PendingPayload): Promise<string> {
  const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await supabaseAdmin.from('pending_operations').delete().eq('sender', sender);
  const { error } = await supabaseAdmin.from('pending_operations').insert({ id, sender, payload });
  if (error) throw new Error(`No se pudo guardar el pendiente: ${error.message}`);
  return id;
}

async function hasPending(sender: string): Promise<boolean> {
  const since = new Date(Date.now() - PENDING_TTL_MS).toISOString();
  const { count } = await supabaseAdmin
    .from('pending_operations')
    .select('id', { count: 'exact', head: true })
    .eq('sender', sender)
    .gte('created_at', since);
  return (count || 0) > 0;
}

/**
 * Toma (y borra) el pendiente. Borrar y leer en un solo paso evita que un doble toque
 * en "Guardar" registre la operación dos veces.
 */
async function takePending(sender: string, id?: string): Promise<PendingPayload | 'expired' | null> {
  let q = supabaseAdmin.from('pending_operations').delete().eq('sender', sender);
  if (id) q = q.eq('id', id);
  const { data } = await q.select();
  const rows = (data || []).sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));
  const row = rows[0];
  if (!row) return null;
  if (Date.now() - new Date(row.created_at).getTime() > PENDING_TTL_MS) return 'expired';
  return row.payload as PendingPayload;
}

// 1. GET: Verificación del Webhook de Meta
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (verifyToken && mode === 'subscribe' && token === verifyToken) {
    console.log('✅ WhatsApp webhook verificado');
    return new NextResponse(challenge, { status: 200 });
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// 2. POST: Recepción de mensajes de WhatsApp
export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch (readErr) {
    console.error('❌ [WEBHOOK] Error leyendo body:', readErr);
    return NextResponse.json({ status: 'read_error' }, { status: 200 });
  }
  if (!rawBody) return NextResponse.json({ status: 'empty_body' }, { status: 200 });

  if (!isValidSignature(rawBody, request.headers.get('x-hub-signature-256'))) {
    console.warn('🚫 [WEBHOOK] Firma inválida: request rechazada');
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ status: 'invalid_json' }, { status: 200 });
  }

  const incoming = extractWhatsAppMessage(body);
  // Notificaciones de estado (sent, delivered, read) no traen mensajes
  if (!incoming) return NextResponse.json({ status: 'acknowledged' }, { status: 200 });

  const { from, type: msgType, text, phoneNumberId, messageId, mediaId, profileName, buttonId } = incoming;
  const meta: OperationMeta = { registeredBy: profileName || `+${from}`, source: 'whatsapp' };
  console.log(`📱 [WEBHOOK] Mensaje de ${from} (tipo: ${msgType}, id: ${messageId})`);

  if (!isAllowedSender(from)) {
    console.warn(`🚫 [WEBHOOK] Número no autorizado: ${from}`);
    return NextResponse.json({ status: 'ignored_sender' }, { status: 200 });
  }

  // Responder 200 de inmediato a Meta y procesar en segundo plano
  after(async () => {
    const reply = (msg: string) => sendWhatsAppMessage(from, msg, phoneNumberId);
    try {
      if (!(await claimMessage(messageId))) {
        console.log(`🔁 [AFTER] Mensaje ${messageId} ya procesado (reintento de Meta), se ignora`);
        return;
      }
      await markAsReadWithTyping(messageId, phoneNumberId);

      // ─── Respuesta a "¿Lo guardo?" de un comprobante (botón o "sí"/"no" escrito) ───
      let decision: { confirm: boolean; id?: string } | null = null;
      if (buttonId?.startsWith('ok:') || buttonId?.startsWith('no:')) {
        decision = { confirm: buttonId.startsWith('ok:'), id: buttonId.slice(3) };
      } else if (text && !mediaId) {
        const norm = normalizeReply(text);
        if ((YES_RE.test(norm) || NO_RE.test(norm)) && (await hasPending(from))) {
          decision = { confirm: YES_RE.test(norm) };
        }
      }
      if (decision) {
        const pending = await takePending(from, decision.id);
        if (pending === null) {
          await reply('Ese comprobante ya fue procesado. Si querés, mandá la foto de nuevo.');
        } else if (pending === 'expired') {
          await reply('⌛ Pasó más de una hora y ese comprobante venció. Mandá la foto de nuevo.');
        } else if (!decision.confirm) {
          await reply('❌ Listo, no guardé nada.');
        } else {
          const { operation, warnings } = await recordOperation(pending.op, pending.meta);
          await reply(formatOperationConfirmation(operation, { warnings, isReceipt: true }));
        }
        return;
      }

      const isAudio = msgType === 'audio' || msgType === 'voice';
      const isImage = msgType === 'image' || msgType === 'document';

      let mediaData: { base64: string; mimeType: string } | null = null;
      if (mediaId) {
        mediaData = await downloadWhatsAppMedia(mediaId);
        if (!mediaData) console.warn('⚠️ [AFTER] No se pudo descargar el medio de Meta');
      }

      if (!text && !mediaData) {
        if (mediaId) await reply('⚠️ No pude descargar el archivo. Probá enviarlo de nuevo.');
        return; // sticker, reacción, etc.
      }

      // Comandos directos por texto
      if (text && !mediaData) {
        const cmd = detectCommand(text);
        if (cmd.isCommand && cmd.command) {
          await reply(await runCommand(cmd.command));
          return;
        }
      }

      const parseResult = await parseOperationWithAIOrFallback(text, {
        audioBase64: isAudio ? mediaData?.base64 : undefined,
        audioMimeType: isAudio ? mediaData?.mimeType : undefined,
        imageBase64: isImage ? mediaData?.base64 : undefined,
        imageMimeType: isImage ? mediaData?.mimeType : undefined,
      });

      const intro = parseResult.transcription ? `🎙️ _"${parseResult.transcription}"_\n\n` : '';

      if (parseResult.isCommand && parseResult.command) {
        await reply(intro + (await runCommand(parseResult.command)));
        return;
      }

      if (!parseResult.success || !parseResult.operation) {
        await reply(
          isAudio
            ? '🎙️ No entendí bien la nota de voz.\n\nRepetila o escribila (ej: *"Compré 500 dólares a 7750 con Itaú"*).'
            : isImage
            ? '🧾 Recibí la imagen pero no pude leer bien el comprobante.\n\nAsegurate de que se vea el monto y el banco, o escribí los datos.'
            : '❓ No entendí la operación.\n\nEjemplos:\n• *Compré 500 dólares a 7750 con Itaú*\n• *Vendí 200 USD a 7820 en efectivo*\n• *Gasté 50 mil en combustible con Itaú*\n\nEscribí *ayuda* para ver todos los comandos.'
        );
        return;
      }

      const validation = validateParsedOperation(parseResult.operation);
      if (!validation.ok) {
        await reply(
          `${intro}❓ ${validation.reason}\n\nNo registré nada. Escribilo completo, por ejemplo: *"Compré 500 dólares a 7750 con Itaú"*.`
        );
        return;
      }

      // Comprobantes: primero mostrar lo que se leyó y pedir confirmación
      if (isImage) {
        const preview = formatOperationConfirmation(
          { ...validation.op, id: '', operationNumber: 0, timestamp: new Date().toISOString() },
          { preview: true }
        );
        const pendingId = await savePending(from, { op: validation.op, meta });
        await sendWhatsAppButtons(
          from,
          preview,
          [
            { id: `ok:${pendingId}`, title: '✅ Guardar' },
            { id: `no:${pendingId}`, title: '❌ Cancelar' },
          ],
          phoneNumberId
        );
        return;
      }

      const { operation, warnings } = await recordOperation(validation.op, meta);
      console.log(`💾 [AFTER] Operación #${operation.operationNumber} guardada (${parseResult.source})`);

      await reply(
        formatOperationConfirmation(operation, {
          warnings,
          isReceipt: isImage,
          transcription: parseResult.transcription,
        })
      );
    } catch (afterError) {
      console.error('❌ [AFTER] Error procesando mensaje:', afterError);
      await reply(
        '⚠️ Hubo un problema procesando tu mensaje. Revisá en la web si quedó registrado antes de reintentar.'
      ).catch(() => {});
    }
  });

  return NextResponse.json({ status: 'received' }, { status: 200 });
}
