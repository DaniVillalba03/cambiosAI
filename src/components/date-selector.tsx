'use client';

import { useRef } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { toLocalISODate, getPreviousDay, getNextDay, cn } from '@/lib/utils';

interface DateSelectorProps {
  selectedDate: string; // 'YYYY-MM-DD'
  onSelectDate: (dateStr: string) => void;
  className?: string;
}

/** "Hoy, 21 de noviembre" · "Ayer, 20 de noviembre" · "jueves 19 de noviembre" (corto para el celular) */
function shortDate(dateStr: string, todayStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const dayMonth = date.toLocaleDateString('es-PY', { day: 'numeric', month: 'long' });
  if (dateStr === todayStr) return `Hoy, ${dayMonth}`;
  if (dateStr === getPreviousDay(todayStr)) return `Ayer, ${dayMonth}`;
  return date.toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Selector de día simple: ‹ día anterior · fecha (abre calendario) · día siguiente › */
export function DateSelector({ selectedDate, onSelectDate, className }: DateSelectorProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const todayStr = toLocalISODate(new Date());
  const isToday = selectedDate === todayStr;

  const openCalendar = () => {
    const el = dateInputRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  };

  const navBtn =
    'w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-ink-2 hover:bg-fill disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <div className={cn('flex items-center gap-1', className)}>
      <button type="button" onClick={() => onSelectDate(getPreviousDay(selectedDate))} className={navBtn} aria-label="Día anterior">
        <ChevronLeft className="w-6 h-6" />
      </button>

      <div className="relative flex-1 min-w-0">
        <button
          type="button"
          onClick={openCalendar}
          className="w-full h-12 rounded-xl flex items-center justify-center gap-2 text-base font-medium text-ink hover:bg-fill"
        >
          <CalendarDays className="w-5 h-5 text-ink-3 shrink-0" />
          <span className="truncate first-letter:uppercase">{shortDate(selectedDate, todayStr)}</span>
        </button>
        <input
          ref={dateInputRef}
          type="date"
          max={todayStr}
          value={selectedDate}
          onChange={(e) => e.target.value && onSelectDate(e.target.value)}
          className="absolute inset-0 opacity-0 pointer-events-none"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      <button
        type="button"
        onClick={() => onSelectDate(getNextDay(selectedDate))}
        disabled={isToday}
        className={navBtn}
        aria-label="Día siguiente"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {!isToday && (
        <button
          type="button"
          onClick={() => onSelectDate(todayStr)}
          className="h-12 px-4 shrink-0 rounded-xl text-base font-semibold text-brand hover:bg-brand-soft"
        >
          Hoy
        </button>
      )}
    </div>
  );
}
