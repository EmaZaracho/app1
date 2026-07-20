import type { AnalysisPeriod } from '../types/financialAnalytics';
import { isMonthAligned, monthSpanFor } from './periodRanges';

export interface ComparisonRange {
  start: string;
  end: string;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate() + days,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds()
  ).toISOString();
}

function shiftMonthsIso(iso: string, months: number): string {
  const d = new Date(iso);
  return new Date(
    d.getFullYear(),
    d.getMonth() + months,
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds()
  ).toISOString();
}

/**
 * Rango inmediatamente anterior a `period`, de igual duración/estrategia.
 * Presets alineados a mes (ver periodRanges.ts) se desplazan por meses
 * calendario; el resto (incluido "custom") se desplaza por la duración
 * exacta en días de `period`. Nunca se comparan períodos de distinta
 * duración/estrategia entre sí.
 */
export function previousEquivalentRange(period: AnalysisPeriod): ComparisonRange {
  if (isMonthAligned(period.preset)) {
    const span = monthSpanFor(period.preset)!;
    return { start: shiftMonthsIso(period.start, -span), end: shiftMonthsIso(period.end, -span) };
  }
  return { start: addDaysIso(period.start, -period.days), end: period.start };
}

/** Los tres bloques equivalentes inmediatamente anteriores a `period`, para promediar. */
export function previousThreeEquivalentRanges(period: AnalysisPeriod): ComparisonRange[] {
  const ranges: ComparisonRange[] = [];
  let cursorStart = period.start;
  let cursorEnd = period.end;
  for (let i = 0; i < 3; i++) {
    const prev = previousEquivalentRange({ ...period, start: cursorStart, end: cursorEnd });
    ranges.push(prev);
    cursorStart = prev.start;
    cursorEnd = prev.end;
  }
  return ranges;
}
