/**
 * Utilidades de fecha con zona horaria fija de Paraguay.
 *
 * El servidor (Vercel) corre en UTC: si usáramos `new Date().getDate()`
 * el "día de hoy" cambiaría a las 21:00 hora paraguaya. Todo cálculo de
 * "hoy" en el backend debe pasar por estas funciones.
 */
export const PY_TIMEZONE = 'America/Asuncion';

/** Devuelve 'YYYY-MM-DD' de la fecha indicada en hora de Paraguay. */
export function dateKeyPY(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function isTodayPY(iso: string): boolean {
  return !!iso && dateKeyPY(iso) === dateKeyPY();
}

/** Fecha legible en español con hora de Paraguay. */
export function formatLongDatePY(date: Date = new Date(), withYear = false): string {
  return date.toLocaleDateString('es-PY', {
    timeZone: PY_TIMEZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}
