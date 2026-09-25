import type { MovementPeriodFilter } from './movementFilters';

/**
 * Interpreta una fecha escrita como dd/mm/aa o dd/mm/aaaa (también acepta "-"
 * o "." como separador). Devuelve la medianoche local de ese día, o null si el
 * texto no es una fecha real (por ejemplo 31/02/26). Los años de dos dígitos
 * se toman como 20aa.
 */
export function parseDayMonthYear(text: string): Date | null {
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** Formatea una fecha ISO como dd/mm/aa en hora local. */
export function formatDayMonthYear(iso: string): string {
  const date = new Date(iso);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear() % 100).padStart(2, '0');
  return `${dd}/${mm}/${yy}`;
}

/**
 * Agrega las barras mientras se tipea: "0109" → "01/09", "010926" → "01/09/26".
 * Solo conserva dígitos, así que borrar una barra no deja el texto trabado.
 */
export function maskDayMonthYear(text: string): string {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export type PeriodInputResult =
  | { ok: true; period: MovementPeriodFilter }
  | { ok: false; error: string };

/**
 * Convierte las fechas "desde" y "hasta" que escribe el usuario (ambas
 * inclusivas) en el período del filtro de movimientos: inicio inclusivo a la
 * medianoche local del primer día y fin exclusivo a la medianoche del día
 * siguiente al último.
 */
export function buildPeriodFromInput(startText: string, endText: string): PeriodInputResult {
  const start = parseDayMonthYear(startText);
  if (!start) return { ok: false, error: 'La fecha de inicio no es válida. Usá dd/mm/aa.' };
  const end = parseDayMonthYear(endText);
  if (!end) return { ok: false, error: 'La fecha de fin no es válida. Usá dd/mm/aa.' };
  if (end < start) return { ok: false, error: 'La fecha de fin no puede ser anterior a la de inicio.' };

  const endExclusive = new Date(end);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return { ok: true, period: { start: start.toISOString(), end: endExclusive.toISOString() } };
}

/** Texto "dd/mm/aa – dd/mm/aa" de un período, mostrando el último día incluido. */
export function describePeriod(period: MovementPeriodFilter): string {
  const lastDay = new Date(period.end);
  lastDay.setDate(lastDay.getDate() - 1);
  return `${formatDayMonthYear(period.start)} – ${formatDayMonthYear(lastDay.toISOString())}`;
}
