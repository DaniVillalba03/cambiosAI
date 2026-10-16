'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Paperclip,
  Mic,
  MicOff,
  Image as ImageIcon,
  CheckCheck,
  ArrowDownCircle,
  ArrowUpCircle,
  Receipt,
  Bot,
  X,
} from 'lucide-react';
import { useAppState } from '@/store/app-context';
import { ChatMessage, AgentResponse, Operation, CURRENCY_FLAGS, CURRENCY_SYMBOLS, CURRENCY_LABELS } from '@/types';
import { formatPYG, formatCurrency, formatTime, cn, generateId } from '@/lib/utils';

export function ChatPanel() {
  const { state, addOperation, todayProfit, todayExpenses } = useAppState();
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      timestamp: new Date().toISOString(),
      sender: 'bot',
      text: '¡Hola! 👋 Soy tu asistente cambiario con IA.\n\nPodés decirme cosas como:\n• *"Compré 500 dólares a 7750 por Ueno"*\n• *"Vendí 200 USD a 7820 en efectivo"*\n• *"Gasté 50 mil en combustible con Itaú"*\n\nTambién podés adjuntar una foto de comprobante 📸 o grabar un audio 🎙️',
    },
  ]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text && !attachedImage) return;
    if (isProcessing) return;

    // Add user message
    const userMsg: ChatMessage = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      sender: 'user',
      text: text || '📷 Imagen adjunta',
      imageBase64: attachedImage || undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setAttachedImage(null);
    setIsProcessing(true);

    // Add processing indicator
    const processingId = generateId();
    setMessages((prev) => [
      ...prev,
      {
        id: processingId,
        timestamp: new Date().toISOString(),
        sender: 'bot',
        text: '',
        isProcessing: true,
      },
    ]);

    try {
      const response = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          imageBase64: attachedImage || undefined,
        }),
      });

      const result = await response.json();

      if (result.success && result.reply) {
        // Direct bot reply (e.g., daily summary command or undo confirmation)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === processingId
              ? {
                  ...m,
                  text: result.reply,
                  isProcessing: false,
                }
              : m
          )
        );
      } else if (result.success && result.operation && !result.operation.isCommand) {
        const agentOp: AgentResponse = result.operation;

        // Build the operation for the store
        const newOp: Omit<Operation, 'id' | 'operationNumber' | 'profit'> = {
          timestamp: new Date().toISOString(),
          type: agentOp.type,
          currency: agentOp.currency,
          amount: agentOp.amount,
          rate: agentOp.rate,
          totalPYG: agentOp.totalPYG || (agentOp.amount && agentOp.rate ? agentOp.amount * agentOp.rate : 0),
          account: agentOp.account || 'Efectivo PYG',
          description: agentOp.description,
        };

        // Add operation to global state
        addOperation(newOp);

        // Calculate profit for the response message
        let profit: number | undefined;
        if (agentOp.type === 'VENTA' && agentOp.currency && agentOp.amount && agentOp.rate) {
          const stock = state.currencyStocks[agentOp.currency];
          if (stock.averageCost > 0) {
            profit = Math.round((agentOp.rate - stock.averageCost) * agentOp.amount);
          }
        }

        // Build confirmation message
        const opNumber = state.nextOperationNumber;
        let confirmText = `✅ *¡Operación #${opNumber} Registrada!*\n\n`;

        if (agentOp.type === 'GASTO') {
          confirmText += `📋 *Tipo:* Gasto\n`;
          confirmText += `💰 *Monto:* ${formatPYG(agentOp.totalPYG || 0)}\n`;
          if (agentOp.description) confirmText += `📝 *Concepto:* ${agentOp.description}\n`;
          confirmText += `🏦 *Cuenta:* ${agentOp.account || 'Efectivo PYG'}\n`;
        } else {
          const flag = agentOp.currency ? CURRENCY_FLAGS[agentOp.currency] : '';
          const symbol = agentOp.currency ? CURRENCY_SYMBOLS[agentOp.currency] : '';
          const label = agentOp.currency ? CURRENCY_LABELS[agentOp.currency] : '';

          confirmText += `📋 *Tipo:* ${agentOp.type === 'COMPRA' ? '🔵 Compra' : '🟡 Venta'}\n`;
          confirmText += `${flag} *Divisa:* ${label} (${agentOp.currency})\n`;
          confirmText += `💵 *Monto:* ${symbol} ${formatCurrency(agentOp.amount || 0)}\n`;
          confirmText += `📊 *Cotización:* Gs. ${formatCurrency(agentOp.rate || 0, 0)}\n`;
          confirmText += `💰 *Total:* ${formatPYG(newOp.totalPYG)}\n`;
          confirmText += `🏦 *Cuenta:* ${agentOp.account || 'Efectivo PYG'}\n`;

          if (profit !== undefined) {
            confirmText += `\n${profit >= 0 ? '🟢' : '🔴'} *Ganancia Cambiaria:* ${profit >= 0 ? '+' : ''}${formatPYG(profit)}`;
          }
        }

        confirmText += `\n\n_Procesado por ${result.source === 'gemini' ? 'Gemini AI ✨' : 'Parser local 🔧'}_`;

        // Replace processing message with confirmation
        setMessages((prev) =>
          prev.map((m) =>
            m.id === processingId
              ? {
                  ...m,
                  text: confirmText,
                  isProcessing: false,
                  operation: { ...newOp, id: generateId(), operationNumber: opNumber, profit } as Operation,
                }
              : m
          )
        );
      } else {
        // Error response
        setMessages((prev) =>
          prev.map((m) =>
            m.id === processingId
              ? {
                  ...m,
                  text: `❌ ${result.error || 'No pude procesar el mensaje. Intentá con algo como:\n• "Compré 500 dólares a 7750 por Ueno"\n• "Vendí 200 USD a 7820 en efectivo"'}`,
                  isProcessing: false,
                }
              : m
          )
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === processingId
            ? {
                ...m,
                text: '❌ Error de conexión. Verificá tu red e intentá de nuevo.',
                isProcessing: false,
              }
            : m
        )
      );
    }

    setIsProcessing(false);
  };

  const handleImageAttach = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = (ev.target?.result as string).split(',')[1];
      setAttachedImage(base64);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const recognitionRef = useRef<any>(null);

  const toggleRecording = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognition.lang = 'es-PY';
        recognition.continuous = false;
        recognition.interimResults = true;

        recognition.onstart = () => {
          setIsRecording(true);
        };

        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0].transcript)
            .join('');
          setInput(transcript);
        };

        recognition.onerror = () => {
          setIsRecording(false);
        };

        recognition.onend = () => {
          setIsRecording(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch {
        // Fallback simulation
        setIsRecording(true);
        setTimeout(() => {
          setInput('Compré 500 dólares a 7750 pagué por Ueno');
          setIsRecording(false);
        }, 1500);
      }
    } else {
      // Fallback if browser doesn't have Web Speech API: simulated voice note transcription
      setIsRecording(true);
      setTimeout(() => {
        setInput('Compré 500 dólares a 7750 pagué por Ueno');
        setIsRecording(false);
      }, 1500);
    }
  };

  const handleQuickTemplate = (text: string) => {
    setInput(text);
    inputRef.current?.focus();
  };

  const handleGenerateDemoReceipt = () => {
    // Generate a clean canvas image of a Paraguayan bank receipt
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 280;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#111827';
      ctx.fillRect(0, 0, 400, 280);

      // Header
      ctx.fillStyle = '#7c3aed';
      ctx.fillRect(0, 0, 400, 45);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.fillText('Ueno Bank - Comprobante de Transferencia', 20, 28);

      // Body text
      ctx.fillStyle = '#e5e7eb';
      ctx.font = '14px sans-serif';
      ctx.fillText('Operación: Transferencia SIPAP', 20, 80);
      ctx.fillText('Monto: Gs. 3.875.000', 20, 110);
      ctx.fillText('Beneficiario: Operador Cambiario', 20, 140);
      ctx.fillText('Concepto: Compra 500 USD @ 7750', 20, 170);
      ctx.fillText('Fecha: ' + new Date().toLocaleDateString('es-PY'), 20, 200);

      ctx.fillStyle = '#34d399';
      ctx.fillText('✓ Transacción Exitosa', 20, 245);

      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      setAttachedImage(base64);
      setInput('Compré 500 dólares a 7750 pagué por Ueno');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Chat Header */}
      <div className="bg-surface-1 border-b border-border px-4 py-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-whatsapp/20 flex items-center justify-center">
          <Bot className="w-5 h-5 text-whatsapp" />
        </div>
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-white">CambiosAI Bot</h2>
          <p className="text-xs text-profit font-medium">
            Ganancia Cambiaria: +{formatPYG(todayProfit)} • {state.operations.filter((o) => {
              const d = new Date(o.timestamp);
              const t = new Date();
              return d.getDate() === t.getDate() && d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear();
            }).length} ops hoy
          </p>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto whatsapp-bg px-3 py-4 space-y-2 chat-scroll">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              'flex animate-slide-up',
              msg.sender === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={cn(
                'max-w-[85%] lg:max-w-[70%] px-3.5 py-2.5 shadow-lg',
                msg.sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-bot'
              )}
            >
              {msg.isProcessing ? (
                <div className="flex items-center gap-2 py-1">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-gray-500">Procesando...</span>
                </div>
              ) : (
                <>
                  {msg.imageBase64 && (
                    <div className="mb-2 rounded-lg overflow-hidden">
                      <img
                        src={`data:image/jpeg;base64,${msg.imageBase64}`}
                        alt="Comprobante"
                        className="w-full max-h-48 object-cover"
                      />
                    </div>
                  )}
                  {/* Operation confirmation card */}
                  {msg.operation && msg.sender === 'bot' && (
                    <div className="mb-2 bg-surface-0/40 rounded-xl p-3 border border-border/30">
                      <div className="flex items-center gap-2 mb-2">
                        {msg.operation.type === 'COMPRA' && (
                          <ArrowDownCircle className="w-4 h-4 text-buy" />
                        )}
                        {msg.operation.type === 'VENTA' && (
                          <ArrowUpCircle className="w-4 h-4 text-sell" />
                        )}
                        {msg.operation.type === 'GASTO' && (
                          <Receipt className="w-4 h-4 text-expense" />
                        )}
                        <span className="text-xs font-bold text-white">
                          Op #{msg.operation.operationNumber}
                        </span>
                      </div>
                    </div>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-line">
                    {msg.text.split(/(\*[^*]+\*)/g).map((part, i) =>
                      part.startsWith('*') && part.endsWith('*') ? (
                        <strong key={i} className="font-semibold">
                          {part.slice(1, -1)}
                        </strong>
                      ) : part.startsWith('_') && part.endsWith('_') ? (
                        <em key={i} className="text-gray-400 text-xs">
                          {part.slice(1, -1)}
                        </em>
                      ) : (
                        <span key={i}>{part}</span>
                      )
                    )}
                  </p>
                  <div className="flex items-center justify-end gap-1 mt-1">
                    <span className="text-[10px] text-gray-500">{formatTime(msg.timestamp)}</span>
                    {msg.sender === 'user' && (
                      <CheckCheck className="w-3.5 h-3.5 text-blue-400" />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Attached Image Preview */}
      {attachedImage && (
        <div className="bg-surface-1 border-t border-border px-4 py-2 flex items-center gap-3">
          <div className="relative">
            <img
              src={`data:image/jpeg;base64,${attachedImage}`}
              alt="Preview"
              className="w-14 h-14 object-cover rounded-lg border border-border"
            />
            <button
              onClick={() => setAttachedImage(null)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-loss rounded-full flex items-center justify-center"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </div>
          <p className="text-xs text-gray-400">Imagen adjunta. Escribí un mensaje para describirla.</p>
        </div>
      )}

      {/* Quick Prompts Bar */}
      <div className="bg-surface-1/90 border-t border-border/40 px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto">
        <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider shrink-0">Atajos:</span>
        <button
          onClick={() => handleQuickTemplate('Compré 500 dólares a 7750 pagué por Ueno')}
          className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-surface-2 hover:bg-buy/20 hover:text-buy text-gray-300 border border-border/40 transition-colors"
        >
          🔵 Compra 500 USD Ueno
        </button>
        <button
          onClick={() => handleQuickTemplate('Vendí 200 USD a 7820 en efectivo')}
          className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-surface-2 hover:bg-sell/20 hover:text-sell text-gray-300 border border-border/40 transition-colors"
        >
          🟡 Venta 200 USD Efectivo
        </button>
        <button
          onClick={() => handleQuickTemplate('Compré 1000 reales a 1520 con Itaú')}
          className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-surface-2 hover:bg-buy/20 hover:text-buy text-gray-300 border border-border/40 transition-colors"
        >
          🇧🇷 Compra 1.000 BRL Itaú
        </button>
        <button
          onClick={() => handleQuickTemplate('Gasté 50 mil en combustible con Itaú')}
          className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-surface-2 hover:bg-expense/20 hover:text-expense text-gray-300 border border-border/40 transition-colors"
        >
          ⛽ Gasto 50k Itaú
        </button>
        <button
          onClick={handleGenerateDemoReceipt}
          className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-purple-900/40 hover:bg-purple-800/60 text-purple-300 border border-purple-700/40 transition-colors flex items-center gap-1"
        >
          📄 Simular Comprobante
        </button>
      </div>

      {/* Input Bar */}
      <div className="bg-surface-1 border-t border-border px-3 py-2.5 flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          onClick={handleImageAttach}
          className="p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-surface-2"
          title="Adjuntar imagen"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        <div className="flex-1 flex items-center bg-surface-2 rounded-full px-4 py-2.5 border border-border/50 focus-within:border-accent/30 transition-colors">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribí un cambio..."
            className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
          />
        </div>

        <button
          onClick={toggleRecording}
          className={cn(
            'p-2 rounded-full transition-all duration-200',
            isRecording
              ? 'bg-loss text-white animate-pulse'
              : 'text-gray-400 hover:text-white hover:bg-surface-2'
          )}
          title={isRecording ? 'Detener grabación' : 'Grabar audio'}
        >
          {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <button
          onClick={handleSend}
          disabled={isProcessing || (!input.trim() && !attachedImage)}
          className={cn(
            'p-2.5 rounded-full transition-all duration-200',
            input.trim() || attachedImage
              ? 'bg-whatsapp text-white hover:bg-whatsapp-dark shadow-lg shadow-whatsapp/20'
              : 'bg-surface-2 text-gray-600'
          )}
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
