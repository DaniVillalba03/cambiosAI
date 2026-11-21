'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, Mic, Square, X, Bot } from 'lucide-react';
import { useAppState } from '@/store/app-context';
import { ChatMessage } from '@/types';
import { formatPYG, formatTime, cn, generateId } from '@/lib/utils';

const WELCOME =
  '¡Hola, Pedro! Registrá operaciones escribiendo como en WhatsApp:\n\n• *Compré 500 dólares a 7750 por Itaú*\n• *Vendí 200 USD a 7820 en efectivo*\n• *Gasté 50 mil en combustible con Itaú*\n\nTambién podés adjuntar la foto de un comprobante o dictar con el micrófono.';

const COMMANDS = [
  { label: 'Resumen', text: 'resumen' },
  { label: 'Saldos', text: 'saldos' },
  { label: 'Stock', text: 'stock' },
  { label: 'Ayuda', text: 'ayuda' },
];

const EXAMPLES = [
  'Compré 500 dólares a 7750 por Itaú',
  'Vendí 200 USD a 7820 en efectivo',
  'Gasté 50 mil en combustible con Itaú',
];

/** Renderiza *negrita* y _cursiva_ estilo WhatsApp */
function RichText({ text }: { text: string }) {
  return (
    <p className="text-sm leading-relaxed whitespace-pre-line break-words">
      {text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, i) =>
        part.length > 2 && part.startsWith('*') && part.endsWith('*') ? (
          <strong key={i} className="font-semibold text-white">
            {part.slice(1, -1)}
          </strong>
        ) : part.length > 2 && part.startsWith('_') && part.endsWith('_') ? (
          <em key={i} className="text-gray-400 not-italic text-xs">
            {part.slice(1, -1)}
          </em>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  );
}

export function ChatPanel() {
  const { todayProfit, todayOperations, refreshFromSupabase } = useAppState();
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    { id: 'welcome', timestamp: new Date().toISOString(), sender: 'bot', text: WELCOME },
  ]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [attached, setAttached] = useState<{ base64: string; mime: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const updateMessage = (id: string, patch: Partial<ChatMessage>) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if ((!text && !attached) || isProcessing) return;

    const image = attached;
    setMessages((prev) => [
      ...prev,
      {
        id: generateId(),
        timestamp: new Date().toISOString(),
        sender: 'user',
        text: text || 'Comprobante adjunto',
        imageBase64: image?.base64,
      },
    ]);
    if (overrideText === undefined) setInput('');
    setAttached(null);
    setIsProcessing(true);

    const processingId = generateId();
    setMessages((prev) => [
      ...prev,
      { id: processingId, timestamp: new Date().toISOString(), sender: 'bot', text: '', isProcessing: true },
    ]);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, imageBase64: image?.base64, imageMimeType: image?.mime }),
      });
      const result = await res.json();

      if (result.success && result.reply) {
        updateMessage(processingId, { text: result.reply, isProcessing: false, operation: result.operation });
        // La operación la guardó el servidor; refrescamos por si Realtime tarda
        if (result.operation) refreshFromSupabase();
      } else {
        updateMessage(processingId, {
          text: `❌ ${result.error || 'No pude procesar el mensaje.'}`,
          isProcessing: false,
        });
      }
    } catch {
      updateMessage(processingId, {
        text: '❌ Error de conexión. Verificá tu red e intentá de nuevo.',
        isProcessing: false,
      });
    }
    setIsProcessing(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SpeechRecognition =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (!SpeechRecognition) {
      // Antes se insertaba un texto de ejemplo "falso": podía registrar una operación inventada.
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          timestamp: new Date().toISOString(),
          sender: 'bot',
          text: 'Este navegador no permite dictado por voz. Usá Chrome, o mandá la nota de voz por WhatsApp.',
        },
      ]);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-PY';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onstart = () => setIsRecording(true);
      recognition.onresult = (event: any) => {
        setInput(
          Array.from(event.results)
            .map((r: any) => r[0].transcript)
            .join('')
        );
      };
      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsRecording(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = !!(input.trim() || attached) && !isProcessing;

  return (
    <div className="h-full flex flex-col">
      {/* Encabezado */}
      <div className="border-b border-border px-4 lg:px-6 h-14 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center">
          <Bot className="w-4 h-4 text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-medium text-white">Asistente MiCambio</h2>
          <p className="text-xs text-muted num truncate">
            Hoy: <span className={todayProfit >= 0 ? 'text-profit' : 'text-loss'}>{todayProfit > 0 ? '+' : ''}{formatPYG(todayProfit)}</span>
            {' · '}
            {todayOperations.length} {todayOperations.length === 1 ? 'operación' : 'operaciones'}
          </p>
        </div>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto whatsapp-bg chat-scroll">
        <div className="max-w-3xl mx-auto px-3 lg:px-6 py-5 space-y-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn('flex animate-slide-up', msg.sender === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[88%] lg:max-w-[75%] px-3.5 py-2.5',
                  msg.sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot'
                )}
              >
                {msg.isProcessing ? (
                  <div className="flex items-center gap-1.5 py-1.5 px-1" aria-label="Procesando">
                    {[0, 150, 300].map((d) => (
                      <span
                        key={d}
                        className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${d}ms` }}
                      />
                    ))}
                  </div>
                ) : (
                  <>
                    {msg.imageBase64 && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`data:image/jpeg;base64,${msg.imageBase64}`}
                        alt="Comprobante"
                        className="mb-2 rounded-lg w-full max-h-56 object-cover"
                      />
                    )}
                    <RichText text={msg.text} />
                    <p className="text-[10px] text-gray-500 text-right mt-1 num">{formatTime(msg.timestamp)}</p>
                  </>
                )}
              </div>
            </div>
          ))}

          {messages.length === 1 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setInput(ex);
                    inputRef.current?.focus();
                  }}
                  className="text-xs px-3 py-1.5 rounded-full border border-border bg-surface-1 text-gray-300 hover:border-border-bright hover:text-white transition-colors"
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Compositor */}
      <div className="border-t border-border bg-surface-0 shrink-0">
        <div className="max-w-3xl mx-auto px-3 lg:px-6 py-3 space-y-2.5">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
            {COMMANDS.map((c) => (
              <button
                key={c.text}
                type="button"
                onClick={() => handleSend(c.text)}
                disabled={isProcessing}
                className="shrink-0 text-xs px-3 py-1 rounded-full bg-surface-2 text-gray-300 hover:text-white hover:bg-surface-3 disabled:opacity-50 transition-colors"
              >
                {c.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleSend('anular')}
              disabled={isProcessing}
              className="shrink-0 text-xs px-3 py-1 rounded-full text-loss/90 hover:bg-loss/10 disabled:opacity-50 transition-colors"
            >
              Anular última
            </button>
          </div>

          {attached && (
            <div className="flex items-center gap-3">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${attached.mime};base64,${attached.base64}`}
                  alt="Vista previa"
                  className="w-12 h-12 object-cover rounded-lg border border-border"
                />
                <button
                  type="button"
                  onClick={() => setAttached(null)}
                  aria-label="Quitar imagen"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-surface-3 border border-border rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
              <p className="text-xs text-muted">Comprobante adjunto. Podés agregar un texto.</p>
            </div>
          )}

          <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface-1 focus-within:border-border-bright px-2 py-1.5 transition-colors">
            <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-500 hover:text-white rounded-lg transition-colors"
              title="Adjuntar comprobante"
              aria-label="Adjuntar comprobante"
            >
              <Paperclip className="w-[18px] h-[18px]" />
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ej: compré 500 dólares a 7750 por Itaú"
              className="flex-1 resize-none bg-transparent py-2 text-sm text-white placeholder-gray-500 outline-none max-h-32"
            />
            <button
              type="button"
              onClick={toggleRecording}
              className={cn(
                'p-2 rounded-lg transition-colors',
                isRecording ? 'bg-loss/15 text-loss' : 'text-gray-500 hover:text-white'
              )}
              title={isRecording ? 'Detener dictado' : 'Dictar por voz'}
              aria-label={isRecording ? 'Detener dictado' : 'Dictar por voz'}
            >
              {isRecording ? <Square className="w-[18px] h-[18px]" /> : <Mic className="w-[18px] h-[18px]" />}
            </button>
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!canSend}
              aria-label="Enviar"
              className={cn(
                'p-2 rounded-lg transition-colors',
                canSend ? 'bg-accent text-surface-0 hover:bg-accent/90' : 'text-gray-600'
              )}
            >
              <Send className="w-[18px] h-[18px]" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
