'use client';

import React, { useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  RotateCcw,
} from 'lucide-react';
import {
  toLocalISODate,
  getPreviousDay,
  getNextDay,
  formatDisplayDate,
  cn,
} from '@/lib/utils';

interface DateSelectorProps {
  selectedDate: string; // 'YYYY-MM-DD'
  onSelectDate: (dateStr: string) => void;
  className?: string;
}

export function DateSelector({
  selectedDate,
  onSelectDate,
  className,
}: DateSelectorProps) {
  const dateInputRef = useRef<HTMLInputElement>(null);
  const todayStr = toLocalISODate(new Date());
  const yesterdayStr = getPreviousDay(todayStr);

  const isToday = selectedDate === todayStr;
  const isYesterday = selectedDate === yesterdayStr;

  const handlePrev = () => {
    onSelectDate(getPreviousDay(selectedDate));
  };

  const handleNext = () => {
    if (!isToday) {
      onSelectDate(getNextDay(selectedDate));
    }
  };

  const handleCalendarClick = () => {
    if (dateInputRef.current) {
      if ('showPicker' in HTMLInputElement.prototype) {
        try {
          dateInputRef.current.showPicker();
        } catch {
          dateInputRef.current.focus();
        }
      } else {
        dateInputRef.current.focus();
      }
    }
  };

  return (
    <div
      className={cn(
        'glass-subtle p-2 sm:p-2.5 rounded-2xl border border-border/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shadow-sm',
        className
      )}
    >
      {/* ─── Navegador Principal (◀ Fecha ▶) ─── */}
      <div className="flex items-center gap-1.5 flex-1 justify-between sm:justify-start">
        {/* Botón Día Anterior */}
        <button
          type="button"
          onClick={handlePrev}
          className="p-2 sm:p-2.5 rounded-xl bg-surface-2 hover:bg-surface-3 active:scale-95 text-gray-300 hover:text-white border border-white/5 transition-colors flex items-center gap-1 text-xs font-bold"
          title="Ver día anterior"
          aria-label="Día anterior"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden xs:inline">Anterior</span>
        </button>

        {/* Botón Central de Fecha con Input de Calendario Oculto */}
        <div className="relative flex-1 max-w-[320px] text-center">
          <button
            type="button"
            onClick={handleCalendarClick}
            className={cn(
              'w-full py-2 px-3 rounded-xl border flex items-center justify-center gap-2 transition-colors group',
              isToday
                ? 'bg-surface-2/60 border-accent/30 text-white hover:border-accent/60'
                : 'bg-amber-500/10 border-amber-500/40 text-amber-200 hover:bg-amber-500/15'
            )}
          >
            <Calendar
              className={cn(
                'w-4 h-4 shrink-0',
                isToday ? 'text-accent' : 'text-amber-400'
              )}
            />
            <span className="text-xs sm:text-sm font-black truncate">
              {formatDisplayDate(selectedDate)}
            </span>
          </button>

          {/* Input de tipo fecha nativo superpuesto */}
          <input
            ref={dateInputRef}
            type="date"
            max={todayStr}
            value={selectedDate}
            onChange={(e) => {
              if (e.target.value) {
                onSelectDate(e.target.value);
              }
            }}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full -z-0"
            aria-label="Seleccionar fecha del calendario"
          />
        </div>

        {/* Botón Día Siguiente */}
        <button
          type="button"
          onClick={handleNext}
          disabled={isToday}
          className={cn(
            'p-2 sm:p-2.5 rounded-xl border transition-colors flex items-center gap-1 text-xs font-bold',
            isToday
              ? 'opacity-30 cursor-not-allowed bg-surface-2 text-gray-500 border-transparent'
              : 'bg-surface-2 hover:bg-surface-3 active:scale-95 text-gray-300 hover:text-white border-white/5'
          )}
          title="Ver día siguiente"
          aria-label="Día siguiente"
        >
          <span className="hidden xs:inline">Siguiente</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* ─── Botones Rápidos (Hoy / Ayer) ─── */}
      <div className="flex items-center gap-1.5 self-center sm:self-auto shrink-0">
        <button
          type="button"
          onClick={() => onSelectDate(todayStr)}
          className={cn(
            'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border',
            isToday
              ? 'bg-accent/20 text-accent border-accent/40 shadow-sm'
              : 'bg-surface-2 text-gray-400 hover:text-gray-200 border-white/5 hover:bg-surface-3'
          )}
        >
          Hoy
        </button>
        <button
          type="button"
          onClick={() => onSelectDate(yesterdayStr)}
          className={cn(
            'px-3 py-1.5 rounded-xl text-xs font-bold transition-colors border',
            isYesterday
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-sm'
              : 'bg-surface-2 text-gray-400 hover:text-gray-200 border-white/5 hover:bg-surface-3'
          )}
        >
          Ayer
        </button>

        {!isToday && (
          <button
            type="button"
            onClick={() => onSelectDate(todayStr)}
            className="px-2.5 py-1.5 rounded-xl bg-accent hover:bg-accent-dim text-surface-0 font-bold text-xs transition-colors flex items-center gap-1 shadow-sm ml-1"
            title="Volver a ver el día de hoy"
          >
            <RotateCcw className="w-3 h-3 stroke-[2.5]" />
            <span className="hidden sm:inline">Volver a Hoy</span>
          </button>
        )}
      </div>
    </div>
  );
}
