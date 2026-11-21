'use client';

import { useState } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  BarChart3,
  ClipboardCheck,
  ArrowLeftRight,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppState } from '@/store/app-context';
import { Dashboard } from '@/components/dashboard';
import { ChatPanel } from '@/components/chat-panel';
import { ReportsPanel } from '@/components/reports-panel';
import { ArqueoPanel } from '@/components/arqueo-panel';

type Tab = 'dashboard' | 'chat' | 'reports' | 'arqueo';

const tabs: { id: Tab; label: string; icon: React.ElementType; shortLabel: string }[] = [
  { id: 'dashboard', label: 'Saldos', icon: LayoutDashboard, shortLabel: 'Saldos' },
  { id: 'chat', label: 'Registrar', icon: MessageSquare, shortLabel: 'Registrar' },
  { id: 'arqueo', label: 'Cierre de caja', icon: ClipboardCheck, shortLabel: 'Cierre' },
  { id: 'reports', label: 'Reportes', icon: BarChart3, shortLabel: 'Reportes' },
];

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-xl bg-accent text-surface-0 flex items-center justify-center shrink-0',
        small ? 'w-8 h-8' : 'w-9 h-9'
      )}
    >
      <ArrowLeftRight className={small ? 'w-4 h-4' : 'w-[18px] h-[18px]'} strokeWidth={2.5} />
    </div>
  );
}

/** Indicador de conexión con Supabase / Realtime */
function SyncStatus({ compact = false }: { compact?: boolean }) {
  const { supabaseStatus, realtimeStatus } = useAppState();
  const live = supabaseStatus.connected && realtimeStatus === 'SUBSCRIBED';
  const connected = supabaseStatus.connected;
  // Sin mensaje de error todavía = primera carga en curso
  const failed = !connected && !!supabaseStatus.message;
  const label = live ? 'En vivo' : connected ? 'Conectado' : failed ? 'Sin conexión' : 'Conectando…';
  const color = live ? 'bg-accent' : connected ? 'bg-sell' : failed ? 'bg-loss' : 'bg-gray-500';

  return (
    <span className="inline-flex items-center gap-2 text-xs text-gray-300">
      <span className="relative flex w-2 h-2">
        {live && <span className={cn('absolute inset-0 rounded-full animate-ping opacity-60', color)} />}
        <span className={cn('relative w-2 h-2 rounded-full', color)} />
      </span>
      {!compact && label}
    </span>
  );
}

/** Aviso visible cuando la base de datos no responde: los datos mostrados pueden ser viejos. */
function ConnectionBanner() {
  const { supabaseStatus, refreshFromSupabase, isLoaded } = useAppState();
  const [retrying, setRetrying] = useState(false);
  if (!isLoaded || supabaseStatus.connected || !supabaseStatus.message) return null;

  return (
    <div className="mx-4 lg:mx-8 mt-4 flex items-start gap-3 rounded-xl border border-loss/30 bg-loss/10 px-4 py-3">
      <AlertTriangle className="w-4 h-4 text-loss mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-100">No hay conexión con la base de datos</p>
        <p className="text-xs text-gray-400 mt-0.5 break-words">
          {supabaseStatus.tableMissing
            ? supabaseStatus.message
            : 'Lo que ves es la última copia guardada en este dispositivo y los mensajes de WhatsApp no se están guardando. Revisá el proyecto de Supabase.'}
        </p>
      </div>
      <button
        type="button"
        onClick={async () => {
          setRetrying(true);
          await refreshFromSupabase();
          setRetrying(false);
        }}
        className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-gray-200 hover:text-white px-2.5 py-1.5 rounded-lg border border-border hover:border-border-bright"
      >
        <RefreshCw className={cn('w-3.5 h-3.5', retrying && 'animate-spin')} />
        Reintentar
      </button>
    </div>
  );
}

export function AppShell() {
  const { isLoaded } = useAppState();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  if (!isLoaded) {
    return (
      <div className="flex h-dvh bg-surface-0 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-pulse-subtle">
            <Logo />
          </div>
          <p className="text-sm text-muted">Cargando saldos…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-surface-0 overflow-hidden">
      {/* ─── Sidebar escritorio ─── */}
      <aside className="hidden lg:flex flex-col w-60 border-r border-border bg-surface-0">
        <div className="flex items-center gap-3 px-5 h-16">
          <Logo />
          <div className="leading-tight">
            <p className="font-semibold text-[15px] text-white tracking-tight">MiCambio</p>
            <p className="text-[11px] text-muted">Caja y divisas</p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-surface-2 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-surface-1'
                )}
              >
                <Icon className={cn('w-[18px] h-[18px]', isActive ? 'text-accent' : 'text-gray-500')} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-border">
          <SyncStatus />
          <p className="text-[11px] text-muted mt-1.5">WhatsApp y web sincronizados</p>
        </div>
      </aside>

      {/* ─── Contenido ─── */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <header className="lg:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-surface-0/95 backdrop-blur z-10">
          <div className="flex items-center gap-2.5">
            <Logo small />
            <span className="font-semibold text-[15px] text-white tracking-tight">MiCambio</span>
          </div>
          <SyncStatus />
        </header>

        <ConnectionBanner />

        <div className="flex-1 overflow-hidden">
          {activeTab === 'dashboard' && <Dashboard onGoToChat={() => setActiveTab('chat')} />}
          {activeTab === 'chat' && <ChatPanel />}
          {activeTab === 'reports' && <ReportsPanel />}
          {activeTab === 'arqueo' && <ArqueoPanel />}
        </div>

        {/* ─── Navegación móvil ─── */}
        <nav className="lg:hidden flex items-stretch border-t border-border bg-surface-0/95 backdrop-blur pb-safe">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center py-2 gap-1 transition-colors',
                  isActive ? 'text-white' : 'text-gray-500'
                )}
              >
                <Icon className={cn('w-5 h-5', isActive && 'text-accent')} />
                <span className="text-[10px] font-medium">{tab.shortLabel}</span>
              </button>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
