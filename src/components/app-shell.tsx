'use client';

import { useState } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  BarChart3,
  ClipboardCheck,
  ArrowLeftRight,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppState } from '@/store/app-context';
import { Dashboard } from '@/components/dashboard';
import { ChatPanel } from '@/components/chat-panel';
import { ReportsPanel } from '@/components/reports-panel';
import { ArqueoPanel } from '@/components/arqueo-panel';

type Tab = 'dashboard' | 'chat' | 'reports' | 'arqueo';

const tabs: { id: Tab; label: string; icon: React.ElementType; shortLabel: string }[] = [
  { id: 'dashboard', label: 'Mis Saldos y Bancos', icon: LayoutDashboard, shortLabel: 'Bancos' },
  { id: 'chat', label: 'Registrar Operación', icon: MessageSquare, shortLabel: 'Chat' },
  { id: 'arqueo', label: 'Cierre de Caja', icon: ClipboardCheck, shortLabel: 'Cierre' },
  { id: 'reports', label: 'Reportes y Gráficos', icon: BarChart3, shortLabel: 'Reportes' },
];

export function AppShell() {
  const { isLoaded } = useAppState();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  if (!isLoaded) {
    return (
      <div className="flex h-dvh bg-surface-0 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-accent to-emerald-400 flex items-center justify-center shadow-lg shadow-accent/20 animate-pulse">
            <ArrowLeftRight className="w-6 h-6 text-surface-0" />
          </div>
          <p className="text-sm font-bold text-gray-300">Cargando tus saldos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-surface-0 overflow-hidden">

      {/* ─── Desktop Sidebar ─── */}
      <aside className="hidden lg:flex flex-col w-64 bg-surface-1 border-r border-border">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-accent to-emerald-400 flex items-center justify-center shadow-lg shadow-accent/10">
            <ArrowLeftRight className="w-5 h-5 text-surface-0" />
          </div>
          <div>
            <h1 className="font-black text-lg text-white tracking-tight">MiCambio</h1>
            <p className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
              Control de Caja & Divisas
            </p>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 px-3 space-y-1.5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-sm font-bold transition-all duration-200',
                  isActive
                    ? 'bg-accent/15 text-accent border border-accent/30 shadow-sm'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-surface-2/60'
                )}
              >
                <Icon className={cn('w-5 h-5', isActive && 'text-accent')} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-border">
          <div className="glass-subtle px-4 py-3 rounded-2xl">
            <p className="text-xs font-bold text-gray-300">Sistema Seguro y Privado</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Tus datos se guardan al instante</p>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3.5 bg-surface-1/95 backdrop-blur-lg border-b border-border/60 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent to-emerald-400 flex items-center justify-center">
              <ArrowLeftRight className="w-4 h-4 text-surface-0" />
            </div>
            <h1 className="font-black text-base text-white tracking-tight">MiCambio</h1>
          </div>
          <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
            Control de Caja
          </span>
        </header>


        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'chat' && <ChatPanel />}
          {activeTab === 'reports' && <ReportsPanel />}
          {activeTab === 'arqueo' && <ArqueoPanel />}
        </div>

        {/* ─── Mobile Bottom Navigation ─── */}
        <nav className="lg:hidden flex items-stretch bg-surface-1/95 backdrop-blur-lg border-t border-border/50 pb-safe">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-all duration-200',
                  isActive ? 'text-accent' : 'text-gray-500 active:text-gray-300'
                )}
              >
                <div
                  className={cn(
                    'p-1.5 rounded-xl transition-all duration-200',
                    isActive && 'bg-accent/10'
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] font-medium">{tab.shortLabel}</span>
              </button>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
