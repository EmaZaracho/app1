import { parseMonthKey, toMonthKey } from '../recurring/recurringDateUtils';

export interface DateRange {
  start: string;
  end: string;
}

/** Rango [inicio, fin) del mes actual en ISO, para consultas mensuales. */
export function currentMonthRange(now: Date = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { start, end };
}

/** Rango [inicio, fin) en ISO de un mes específico (YYYY-MM), para consultas mensuales. */
export function monthRange(monthKey: string): DateRange {
  const { year, month } = parseMonthKey(monthKey);
  const start = new Date(year, month, 1).toISOString();
  const end = new Date(year, month + 1, 1).toISOString();
  return { start, end };
}

/** true si monthKey (YYYY-MM) es posterior al mes calendario de `now`: no se puede navegar a futuro. */
export function isFutureMonthKey(monthKey: string, now: Date = new Date()): boolean {
  return monthKey > toMonthKey(now);
}
