import { monthRange, type DateRange } from '../db/dateRange';
import { shiftMonthKey, toMonthKey } from '../recurring/recurringDateUtils';

export type CategoryChange =
  | { kind: 'new' }
  | { kind: 'same' }
  | { kind: 'up' | 'down'; percent: number };

/**
 * Variación del gasto de una categoría respecto del período anterior. Sin gasto
 * previo es "nuevo" (no hay base para un porcentaje); una variación que redondea
 * a 0% se considera igual.
 */
export function categoryChange(current: number, previous: number): CategoryChange {
  if (previous <= 0) return current > 0 ? { kind: 'new' } : { kind: 'same' };
  const percent = Math.round((Math.abs(current - previous) / previous) * 100);
  if (percent === 0) return { kind: 'same' };
  return { kind: current > previous ? 'up' : 'down', percent };
}

export interface ComparisonPeriod {
  range: DateRange;
  /** true si el mes elegido está en curso y solo se compara el tramo equivalente del mes anterior. */
  partial: boolean;
  /** Cantidad de días del mes anterior incluidos (solo cuando es parcial). */
  days: number;
}

/**
 * Rango del mes anterior contra el cual comparar `monthKey`. Para el mes en
 * curso se toman solo los primeros días equivalentes (hasta el día de hoy), así
 * un mes a medias no parece una baja contra un mes completo.
 */
export function previousMonthComparison(monthKey: string, now: Date = new Date()): ComparisonPeriod {
  const full = monthRange(shiftMonthKey(monthKey, -1));
  if (monthKey !== toMonthKey(now)) return { range: full, partial: false, days: 0 };

  const start = new Date(full.start);
  const clippedEnd = new Date(start.getFullYear(), start.getMonth(), now.getDate() + 1);
  const end = clippedEnd < new Date(full.end) ? clippedEnd : new Date(full.end);
  // Días realmente incluidos: el mes anterior puede tener menos que el día de hoy (31 de marzo vs. febrero).
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  return { range: { start: full.start, end: end.toISOString() }, partial: true, days };
}
