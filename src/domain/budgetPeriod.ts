export type BudgetPeriod = 'weekly' | 'biweekly' | 'monthly';

export const BUDGET_PERIODS: BudgetPeriod[] = ['weekly', 'biweekly', 'monthly'];

export const BUDGET_PERIOD_LABELS: Record<BudgetPeriod, string> = {
  weekly: 'Semanal',
  biweekly: 'Quincenal',
  monthly: 'Mensual',
};

/** Texto para frases tipo "gastado esta quincena" / "este mes". */
export const BUDGET_PERIOD_CURRENT: Record<BudgetPeriod, string> = {
  weekly: 'esta semana',
  biweekly: 'esta quincena',
  monthly: 'este mes',
};

/** Duración en días de los ciclos que arrancan en una fecha de inicio. El mensual sigue el calendario. */
const CYCLE_DAYS: Record<Exclude<BudgetPeriod, 'monthly'>, number> = {
  weekly: 7,
  biweekly: 15,
};

export interface BudgetRange {
  start: string;
  end: string;
}

export function isBudgetPeriod(value: string): value is BudgetPeriod {
  return (BUDGET_PERIODS as string[]).includes(value);
}

/** Fecha local en formato YYYY-MM-DD, usada como ancla de los ciclos. */
export function toAnchorDate(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function parseAnchorDate(anchor: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(anchor);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * Rango [inicio, fin) del ciclo de presupuesto que contiene a `now`. Los
 * mensuales siguen el mes calendario; los semanales y quincenales (7 y 15 días)
 * repiten ciclos desde la fecha de inicio elegida. Sin ancla válida se usa el
 * día de `now` como inicio del ciclo.
 */
export function budgetRange(
  period: BudgetPeriod,
  anchorDate: string | null,
  now: Date = new Date()
): BudgetRange {
  if (period === 'monthly') {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    };
  }
  const length = CYCLE_DAYS[period];
  const anchor = (anchorDate ? parseAnchorDate(anchorDate) : null) ?? new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Diferencia en días de calendario vía UTC para que el cambio de hora no corra el ciclo.
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const anchorUtc = Date.UTC(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const daysSinceAnchor = Math.round((today - anchorUtc) / 86_400_000);
  const cycleOffset = Math.floor(daysSinceAnchor / length) * length;
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + cycleOffset);
  const end = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + cycleOffset + length);
  return { start: start.toISOString(), end: end.toISOString() };
}
