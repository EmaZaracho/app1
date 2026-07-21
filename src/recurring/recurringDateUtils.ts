/**
 * Utilidades de fecha para gastos recurrentes. Todo trabaja con fechas LOCALES
 * en formato YYYY-MM-DD (sin hora), para que nunca cambie de día por
 * conversiones UTC. Centraliza el cálculo de fechas del calendario financiero.
 */

/** Formatea una fecha local a YYYY-MM-DD (usa componentes locales, no UTC). */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** YYYY-MM del mes de una fecha local. */
export function toMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Fecha local de hoy como YYYY-MM-DD. `now` inyectable para tests. */
export function todayLocalDateString(now: Date = new Date()): string {
  return toLocalDateString(now);
}

/** Descompone un YYYY-MM-DD en year/month(0-based)/day. */
export function parseDateString(dateStr: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}

/** Descompone un YYYY-MM en year/month(0-based). */
export function parseMonthKey(monthKey: string): { year: number; month: number } {
  const [y, m] = monthKey.split('-').map(Number);
  return { year: y, month: m - 1 };
}

/** Cantidad de días del mes (month es 0-based). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Fecha efectiva (YYYY-MM-DD) de una ocurrencia para (year, month 0-based)
 * dado un día del mes configurado (1-31). Si el día no existe en ese mes
 * (p. ej. 31 en febrero), usa el último día real del mes.
 */
export function scheduledDateFor(year: number, month: number, dayOfMonth: number): string {
  const lastDay = daysInMonth(year, month);
  const day = Math.min(dayOfMonth, lastDay);
  return toLocalDateString(new Date(year, month, day));
}

/** Compara dos YYYY-MM-DD lexicográficamente (válido por el formato ISO-fecha). */
export function compareDateStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** true si `date` (YYYY-MM-DD) es estrictamente anterior a `reference`. */
export function isBefore(date: string, reference: string): boolean {
  return compareDateStrings(date, reference) < 0;
}

/** Primer y último día (YYYY-MM-DD) de un mes calendario. */
export function monthBounds(year: number, month: number): { first: string; last: string } {
  return {
    first: toLocalDateString(new Date(year, month, 1)),
    last: toLocalDateString(new Date(year, month, daysInMonth(year, month))),
  };
}

/** Avanza (o retrocede) un mes calendario respecto de un YYYY-MM. */
export function shiftMonthKey(monthKey: string, delta: number): string {
  const { year, month } = parseMonthKey(monthKey);
  const d = new Date(year, month + delta, 1);
  return toMonthKey(d);
}

/** YYYY-MM del mes de un YYYY-MM-DD. */
export function monthKeyOfDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Etiqueta legible del mes en español, p. ej. "Agosto 2026". */
export function monthLabel(monthKey: string): string {
  const { year, month } = parseMonthKey(monthKey);
  const label = new Date(year, month, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
