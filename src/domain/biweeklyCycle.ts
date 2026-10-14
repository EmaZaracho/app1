import type { DateRange } from '../db/dateRange';
import { budgetRange } from './budgetPeriod';
import type { ComparisonPeriod } from './categoryChange';

/** Domingo que arranca el primer ciclo de 2 semanas del Resumen (cada ciclo va de domingo a sábado). */
export const DEFAULT_BIWEEKLY_ANCHOR = '2026-10-11';

const CYCLE_DAYS = 14;

/** Rango [inicio, fin) del ciclo de 14 días que está `offset` ciclos antes (negativo) o después del de `now`. */
export function biweeklyRangeAt(anchor: string, offset: number, now: Date = new Date()): DateRange {
  const shifted = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset * CYCLE_DAYS);
  return budgetRange('biweekly', anchor, shifted);
}

/**
 * Ciclo anterior contra el cual comparar el ciclo `offset`. Para el ciclo en
 * curso (offset 0) se toman solo los primeros días equivalentes (hasta hoy), así
 * un ciclo a medias no parece una baja contra uno completo.
 */
export function previousBiweeklyComparison(anchor: string, offset: number, now: Date = new Date()): ComparisonPeriod {
  const previous = biweeklyRangeAt(anchor, offset - 1, now);
  if (offset !== 0) return { range: previous, partial: false, days: 0 };

  const current = biweeklyRangeAt(anchor, 0, now);
  const start = new Date(previous.start);
  const currentStart = new Date(current.start);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Días de calendario transcurridos del ciclo actual, contando hoy (vía UTC para esquivar el cambio de hora).
  const days = Math.min(
    CYCLE_DAYS,
    Math.round(
      (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
        Date.UTC(currentStart.getFullYear(), currentStart.getMonth(), currentStart.getDate())) /
        86_400_000
    ) + 1
  );
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days);
  return { range: { start: previous.start, end: end.toISOString() }, partial: days < CYCLE_DAYS, days };
}
