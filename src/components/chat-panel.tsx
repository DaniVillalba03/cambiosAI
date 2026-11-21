'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Camera, Mic, Square, X } from 'lucide-react';
import { useAppState } from '@/store/app-context';
import { ChatMessage } from '@/types';
import { formatTime, cn, generateId } from '@/lib/utils';

const EXAMPLES = [
  'Compré 500 dólares a 7750 por Itaú',
  'Vendí 200 dólares a 7820 en efectivo',
  'Gasté 50 mil en combustible',
];

const QUICK = [
  { label: 'Resumen del día', text: 'resumen' },
  { label: 'Ver saldos', text: 'saldos' },
  { label: 'Ver billetes', text: 'stock' },
];

/** Muestra *negrita* y _cursiva_ como en WhatsApp. */
function RichText({ text }: { text: string }) {
  return (
    <p className="text-base leading-relaxed whitespace-pre-line break-words">
      {text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, i) =>
        part.length > 2 && part.startsWith('*') && part.endsWith('*') ? (
          <strong key={i} className="font-semibold">
            {part.slice(1, -1)}
          </strong>
        ) : part.length > 2 && part.startsWith('_') && part.endsWith('_') ? (
          <span key={i} className="text-ink-3">
            {part.slice(1, -1)}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

export function ChatPanel() {
  const { refreshFromSupabase } = useAppState();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [attached, setAttached] = useState<{ base64: string; mime: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const push = (m: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const id = generateId();
    setMessages((prev) => [...prev, { id, timestamp: new Date().toISOString(), ...m }]);
    return id;
  };
  const update = (id: string, patch: Partial<ChatMessage>) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if ((!text && !attached) || busy) return;
    const image = attached;

    push({ sender: 'user', text: text || 'Foto de comprobante', imageBase64: image?.base64 });
    if (override === undefined) setInput('');
    setAttached(null);
    setBusy(true);
    const pending = push({ sender: 'bot', text: '', isProcessing: true });

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, imageBase64: image?.base64, imageMimeType: image?.mime }),
      });
      const r = await res.json();
      if (r.success && r.reply) {
        update(pending, { text: r.reply, isProcessing: false, operation: r.operation });
        if (r.operation) refreshFromSupabase();
      } else {
        update(pending, {
          text: r.error || 'No pude entender el mensaje. Probá escribirlo de otra forma.',
          isProcessing: false,
        });
      }
    } catch {
      update(pending, { text: 'No hay conexión. Revisá internet e intentá de nuevo.', isProcessing: false });
    }
    setBusy(false);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(',')[1];
      setAttached({ base64, mime: file.type || 'image/jpeg' });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const toggleMic = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SR =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;
    if (!SR) {
      push({ sender: 'bot', text: 'Este navegador no permite dictar. Podés mandar la nota de voz por WhatsApp.' });
      return;
    }
    try {
      const rec = new SR();
      rec.lang = 'es-PY';
      rec.interimResults = true;
      rec.onstart = () => setIsRecording(true);
      rec.onresult = (ev: any) =>
        setInput(
          Array.from(ev.results)
            .map((r: any) => r[0].transcript)
            .join('')
        );
      rec.onerror = () => setIsRecording(false);
      rec.onend = () => setIsRecording(false);
      recognitionRef.current = rec;
      rec.start();
    } catch {
      setIsRecording(false);
    }
  };

  const canSend = !!(input.trim() || attached) && !busy;
  const empty = messages.length === 0;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 lg:py-10">
          {empty ? (
            <div className="px-1">
              <h1 className="font-serif text-3xl font-semibold text-ink">Anotar</h1>
              <p className="text-lg text-ink-2 mt-2">
                Escribí la operación como si mandaras un WhatsApp. También podés sacarle foto a un comprobante.
              </p>

              <p className="text-[15px] text-ink-3 mt-8 mb-3">Por ejemplo, tocá uno:</p>
              <div className="space-y-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => {
                      setInput(ex);
                      inputRef.current?.focus();
                    }}
                    className="w-full text-left card px-4 py-3.5 text-base text-ink hover:border-line-strong"
                  >
                    “{ex}”
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn('flex animate-fade-in', m.sender === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[88%] sm:max-w-[80%] px-4 py-3 rounded-2xl',
                      m.sender === 'user'
                        ? 'bg-brand-soft text-ink rounded-br-md'
                        : 'bg-card border border-line text-ink rounded-bl-md'
                    )}
                  >
                    {m.isProcessing ? (
                      <p className="text-base text-ink-3">Anotando…</p>
                    ) : (
                      <>
                        {m.imageBase64 && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={`data:image/jpeg;base64,${m.imageBase64}`}
                            alt="Comprobante"
                            className="mb-2 rounded-lg w-full max-h-64 object-cover"
                          />
                        )}
                        <RichText text={m.text} />
                        <p className="text-xs text-ink-3 text-right mt-1 tabular">{formatTime(m.timestamp)}</p>
                      </>
                    )}
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>
      </div>

      {/* ─── Para escribir ─── */}
      <div className="border-t border-line bg-paper">
        <div className="max-w-2xl mx-auto px-3 sm:px-6 py-3 space-y-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {QUICK.map((q) => (
              <button
                key={q.text}
                type="button"
                onClick={() => send(q.text)}
                disabled={busy}
                className="shrink-0 h-10 px-4 rounded-full border border-line-strong bg-card text-[15px] text-ink-2 hover:bg-fill disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => send('anular')}
              disabled={busy}
              className="shrink-0 h-10 px-4 rounded-full border border-neg/30 bg-card text-[15px] text-neg hover:bg-neg-soft disabled:opacity-50"
            >
              Deshacer la última
            </button>
          </div>

          {attached && (
            <div className="flex items-center gap-3">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${attached.mime};base64,${attached.base64}`}
                  alt="Foto adjunta"
                  className="w-14 h-14 object-cover rounded-lg border border-line"
                />
                <button
                  type="button"
                  onClick={() => setAttached(null)}
                  aria-label="Quitar foto"
                  className="absolute -top-2 -right-2 w-6 h-6 bg-ink text-white rounded-full flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[15px] text-ink-2">Foto lista. Tocá enviar.</p>
            </div>
          )}

          <div className="flex items-end gap-2">
            <input type="file" ref={fileRef} accept="image/*" className="hidden" onChange={onFile} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center text-ink-2 hover:bg-fill"
              aria-label="Adjuntar foto de comprobante"
              title="Foto de comprobante"
            >
              <Camera className="w-6 h-6" />
            </button>
            <div className="flex-1 min-w-0 flex items-end rounded-3xl border border-line-strong bg-card focus-within:border-brand pl-4 pr-1">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Escribí acá…"
                className="flex-1 min-w-0 resize-none bg-transparent py-3 text-base text-ink placeholder:text-ink-3 outline-none max-h-32"
              />
              <button
                type="button"
                onClick={toggleMic}
                className={cn(
                  'w-10 h-10 my-1 shrink-0 rounded-full flex items-center justify-center',
                  isRecording ? 'bg-neg-soft text-neg' : 'text-ink-3 hover:text-ink'
                )}
                aria-label={isRecording ? 'Dejar de dictar' : 'Dictar con la voz'}
              >
                {isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => send()}
              disabled={!canSend}
              aria-label="Enviar"
              className="w-12 h-12 shrink-0 rounded-full flex items-center justify-center bg-brand text-white hover:bg-brand-hover disabled:bg-fill-2 disabled:text-ink-3"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
