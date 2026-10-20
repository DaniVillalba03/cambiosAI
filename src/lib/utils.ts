import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPYG(amount: number): string {
  const absAmount = Math.abs(amount);
  const formatted = new Intl.NumberFormat('es-PY', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(absAmount);
  return `${amount < 0 ? '-' : ''}Gs. ${formatted}`;
}

export function formatCurrency(amount: number, decimals: number = 2): string {
  return new Intl.NumberFormat('es-PY', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

export function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function generateId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function isToday(isoString: string): boolean {
  return isSameDay(isoString, toLocalISODate(new Date()));
}

/**
 * Convierte un objeto Date a string 'YYYY-MM-DD' en hora local
 */
export function toLocalISODate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Compara si una fecha ISO corresponde al mismo día local que targetDateStr ('YYYY-MM-DD')
 */
export function isSameDay(isoString: string, targetDateStr: string): boolean {
  if (!isoString) return false;
  const d = new Date(isoString);
  return toLocalISODate(d) === targetDateStr;
}

/**
 * Devuelve el día anterior en formato 'YYYY-MM-DD'
 */
export function getPreviousDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return toLocalISODate(date);
}

/**
 * Devuelve el día siguiente en formato 'YYYY-MM-DD'
 */
export function getNextDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + 1);
  return toLocalISODate(date);
}

/**
 * Formato amigable en español para la fecha seleccionada
 */
export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const todayStr = toLocalISODate(new Date());

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = toLocalISODate(yesterday);

  const formatted = date.toLocaleDateString('es-PY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const cap = formatted.charAt(0).toUpperCase() + formatted.slice(1);

  if (dateStr === todayStr) {
    return `Hoy, ${cap}`;
  }
  if (dateStr === yesterdayStr) {
    return `Ayer, ${cap}`;
  }
  return cap;
}


/**
 * Convierte cualquier texto numérico con puntos o comas a un número entero limpio
 */
export function parseNumberString(val: string): number {
  if (!val) return 0;
  const clean = val.replace(/[^\d-]/g, '');
  const parsed = parseInt(clean, 10);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Formatea un número para visualización en inputs con puntos de miles (es-PY)
 */
export function formatThousandsInput(val: number | string): string {
  const num = typeof val === 'number' ? val : parseNumberString(val);
  return new Intl.NumberFormat('es-PY').format(num);
}

/**
 * Convierte un texto con decimales a número flotante
 */
export function parseDecimalString(val: string): number {
  if (!val) return 0;
  const clean = val.trim().replace(/\./g, '').replace(/,/g, '.');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
}

