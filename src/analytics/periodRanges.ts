import type { AnalysisPeriod, AnalysisPeriodPreset } from '../types/financialAnalytics';

/**
 * Presets cuya estrategia de comparación es por LÍMITES DE MES CALENDARIO
 * (se desplazan N meses hacia atrás), en vez de por duración exacta en días.
 * Elegido así porque "últimos 3/6 meses" lee naturalmente como "N meses
 * calendario", mientras que un rango de 90/180 días exactos desalinearía el
 * inicio del período respecto al 1° de mes. Es una decisión de producto
 * documentada, no la única válida.
 */
const MONTH_SPAN: Partial<Record<AnalysisPeriodPreset, number>> = {
  current_month: 1,
  previous_month: 1,
  last_3_months: 3,
  last_6_months: 6,
};

export function isMonthAligned(preset: AnalysisPeriodPreset): boolean {
  return preset in MONTH_SPAN;
}

export function monthSpanFor(preset: AnalysisPeriodPreset): number | null {
  return MONTH_SPAN[preset] ?? null;
}

const PRESET_LABELS: Record<AnalysisPeriodPreset, string> = {
  current_month: 'Este mes',
  previous_month: 'Mes anterior',
  last_30_days: 'Últimos 30 días',
  last_3_months: 'Últimos 3 meses',
  last_6_months: 'Últimos 6 meses',
  custom: 'Período personalizado',
};

/** Medianoche LOCAL del (year, month, day) dado. El constructor de Date ya usa la zona horaria local. */
function localMidnight(year: number, month: number, day: number): Date {
  return new Date(year, month, day, 0, 0, 0, 0);
}

function daysBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.round(ms / 86400000);
}

export interface CustomRangeInput {
  start: Date;
  end: Date;
}

/**
 * Resuelve un preset a un rango [start, end) en instantes ISO, respetando la
 * zona horaria local del usuario. `end` es SIEMPRE exclusivo (coherente con
 * `created_at >= start AND created_at < end` usado en el resto de la app).
 * `now` es inyectable para tests.
 *
 * - current_month / previous_month: límites exactos del mes calendario.
 * - last_30_days: ventana móvil de 30 días terminando hoy inclusive.
 * - last_3_months / last_6_months: desde el 1° del mes N-1 atrás, hasta hoy
 *   inclusive (ver MONTH_SPAN).
 * - custom: `end` del usuario se toma inclusivo y se normaliza a exclusivo
 *   (día siguiente).
 */
export function resolvePeriod(
  preset: AnalysisPeriodPreset,
  now: Date = new Date(),
  custom?: CustomRangeInput
): AnalysisPeriod {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  let startDate: Date;
  let endDate: Date;

  switch (preset) {
    case 'current_month':
      startDate = localMidnight(y, m, 1);
      endDate = localMidnight(y, m + 1, 1);
      break;
    case 'previous_month':
      startDate = localMidnight(y, m - 1, 1);
      endDate = localMidnight(y, m, 1);
      break;
    case 'last_30_days':
      endDate = localMidnight(y, m, d + 1);
      startDate = localMidnight(y, m, d + 1 - 30);
      break;
    case 'last_3_months':
      endDate = localMidnight(y, m, d + 1);
      startDate = localMidnight(y, m - 2, 1);
      break;
    case 'last_6_months':
      endDate = localMidnight(y, m, d + 1);
      startDate = localMidnight(y, m - 5, 1);
      break;
    case 'custom': {
      if (!custom) throw new Error('Un período personalizado requiere fecha de inicio y de fin.');
      if (custom.start.getTime() > custom.end.getTime()) {
        throw new Error('La fecha inicial debe ser anterior o igual a la fecha final.');
      }
      startDate = localMidnight(custom.start.getFullYear(), custom.start.getMonth(), custom.start.getDate());
      endDate = localMidnight(custom.end.getFullYear(), custom.end.getMonth(), custom.end.getDate() + 1);
      break;
    }
    default: {
      const exhaustive: never = preset;
      throw new Error(`Preset de período desconocido: ${exhaustive}`);
    }
  }

  const start = startDate.toISOString();
  const end = endDate.toISOString();
  return { preset, start, end, days: daysBetween(start, end), label: PRESET_LABELS[preset] };
}
