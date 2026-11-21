'use client';

import { useState } from 'react';
import { Home, PencilLine, ClipboardList, BarChart3, AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppState } from '@/store/app-context';
import { Dashboard } from '@/components/dashboard';
import { ChatPanel } from '@/components/chat-panel';
import { ReportsPanel } from '@/components/reports-panel';
import { ArqueoPanel } from '@/components/arqueo-panel';

export type Tab = 'inicio' | 'anotar' | 'cierre' | 'informes';

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'inicio', label: 'Inicio', icon: Home },
  { id: 'anotar', label: 'Anotar', icon: PencilLine },
  { id: 'cierre', label: 'Cierre', icon: ClipboardList },
  { id: 'informes', label: 'Informes', icon: BarChart3 },
];

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-xl bg-brand text-white flex items-center justify-center money text-xl leading-none">
        ₲
      </div>
      <span className="text-lg font-semibold text-ink tracking-tight">MiCambio</span>
    </div>
  );
}

/** Estado de sincronización en palabras simples. */
function SyncStatus() {
  const { supabaseStatus, realtimeStatus } = useAppState();
  const connected = supabaseStatus.connected;
  const failed = !connected && !!supabaseStatus.message;
  const live = connected && realtimeStatus === 'SUBSCRIBED';

  const label = live ? 'Al día' : connected ? 'Conectado' : failed ? 'Sin conexión' : 'Conectando…';
  const dot = live || connected ? 'bg-pos' : failed ? 'bg-neg' : 'bg-ink-3';

  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-2" title="Sincronización con WhatsApp">
      <span className={cn('w-2.5 h-2.5 rounded-full', dot)} />
      {label}
    </span>
  );
}

function ConnectionBanner() {
  const { supabaseStatus, refreshFromSupabase, isLoaded } = useAppState();
  const [retrying, setRetrying] = useState(false);
  if (!isLoaded || supabaseStatus.connected || !supabaseStatus.message) return null;

  return (
    <div className="mx-4 lg:mx-auto lg:max-w-3xl lg:w-full mt-4 flex items-start gap-3 rounded-2xl border border-neg/30 bg-neg-soft px-4 py-3.5">
      <AlertTriangle className="w-5 h-5 text-neg mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ink">No se pudo conectar</p>
        <p className="text-[15px] text-ink-2 mt-0.5">
          Los números que ves pueden no estar actualizados y lo que se mande por WhatsApp no se está guardando.
        </p>
      </div>
      <button
        type="button"
        onClick={async () => {
          setRetrying(true);
          await refreshFromSupabase();
          setRetrying(false);
        }}
        className="shrink-0 inline-flex items-center gap-1.5 text-[15px] font-semibold text-neg px-3 py-2 rounded-lg hover:bg-white/60"
      >
        <RefreshCw className={cn('w-4 h-4', retrying && 'animate-spin')} />
        Reintentar
      </button>
    </div>
  );
}

export function AppShell() {
  const { isLoaded } = useAppState();
  const [activeTab, setActiveTab] = useState<Tab>('inicio');

  if (!isLoaded) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <p className="text-ink-3">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* ─── Menú lateral (computadora) ─── */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-line bg-paper px-4 py-6">
        <div className="px-2">
          <Brand />
        </div>
        <nav className="mt-10 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 h-12 rounded-xl text-base transition-colors',
                  active ? 'bg-card text-ink font-semibold shadow-sm border border-line' : 'text-ink-2 hover:bg-fill'
                )}
              >
                <Icon className={cn('w-5 h-5', active ? 'text-brand' : 'text-ink-3')} />
                {tab.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto px-2">
          <SyncStatus />
        </div>
      </aside>

      {/* ─── Contenido ─── */}
      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="lg:hidden flex items-center justify-between px-4 h-16 border-b border-line bg-paper">
          <Brand />
          <SyncStatus />
        </header>

        <ConnectionBanner />

        <div className="flex-1 min-h-0">
          {activeTab === 'inicio' && <Dashboard onNavigate={setActiveTab} />}
          {activeTab === 'anotar' && <ChatPanel />}
          {activeTab === 'cierre' && <ArqueoPanel />}
          {activeTab === 'informes' && <ReportsPanel />}
        </div>

        {/* ─── Barra inferior (celular) ─── */}
        <nav className="lg:hidden grid grid-cols-4 border-t border-line bg-card pb-safe">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 h-16 text-[13px] transition-colors',
                  active ? 'text-brand font-semibold' : 'text-ink-3'
                )}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="w-6 h-6" strokeWidth={active ? 2.25 : 1.75} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
