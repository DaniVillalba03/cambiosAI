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
import { Dashboard } from '@/components/dashboard';
import { ChatPanel } from '@/components/chat-panel';
import { ReportsPanel } from '@/components/reports-panel';
import { ArqueoPanel } from '@/components/arqueo-panel';

type Tab = 'dashboard' | 'chat' | 'reports' | 'arqueo';

const tabs: { id: Tab; label: string; icon: React.ElementType; shortLabel: string }[] = [
  { id: 'dashboard', label: 'Panel Principal', icon: LayoutDashboard, shortLabel: 'Panel' },
  { id: 'chat', label: 'Chat IA', icon: MessageSquare, shortLabel: 'Chat' },
  { id: 'reports', label: 'Reportes', icon: BarChart3, shortLabel: 'Reportes' },
  { id: 'arqueo', label: 'Arqueo', icon: ClipboardCheck, shortLabel: 'Arqueo' },
];

export function AppShell() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  return (
    <div className="flex h-dvh bg-surface-0 overflow-hidden">
      {/* ─── Desktop Sidebar ─── */}
      <aside className="hidden lg:flex flex-col w-64 bg-surface-1 border-r border-border">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-profit flex items-center justify-center">
            <ArrowLeftRight className="w-5 h-5 text-surface-0" />
          </div>
          <div>
            <h1 className="font-bold text-lg text-white tracking-tight">CambiosAI</h1>
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Zap className="w-3 h-3 text-accent" />
              Powered by Gemini
            </p>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 px-3 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-accent/10 text-accent border border-accent/20'
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
          <div className="glass-subtle px-4 py-3">
            <p className="text-xs text-gray-500">Fase 1 • v0.1.0</p>
            <p className="text-xs text-gray-600 mt-1">localStorage • Offline Ready</p>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ─── */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-surface-1/90 backdrop-blur-lg border-b border-border/50 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-profit flex items-center justify-center">
              <ArrowLeftRight className="w-4 h-4 text-surface-0" />
            </div>
            <h1 className="font-bold text-base text-white tracking-tight">CambiosAI</h1>
          </div>
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Zap className="w-3 h-3 text-accent" />
            Gemini
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
