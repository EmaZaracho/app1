import { isValidCategoryForType, type Category } from '../types';
import { currentMonthRange, monthRange, type DateRange } from './dateRange';
import type { SqlDatabase } from './sqlDatabase';

export { monthRange, isFutureMonthKey } from './dateRange';

export interface CategoryTotal {
  category: Category;
  total: number;
}

export interface MonthlyTrendPoint {
  monthKey: string;
  monthLabel: string;
  income: number;
  expense: number;
}

/** Rango del gráfico de tendencia: 6 o 12 meses, o todo el historial elegible. */
export type TrendRange = 6 | 12 | 'all';

export interface TrendTotals {
  income: number;
  expense: number;
  balance: number;
}

/** Suma los puntos de tendencia en un total de ingresos, gastos y balance neto del período. */
export function sumMonthlyTrend(points: MonthlyTrendPoint[]): TrendTotals {
  const totals = points.reduce(
    (acc, p) => ({ income: acc.income + p.income, expense: acc.expense + p.expense }),
    { income: 0, expense: 0 }
  );
  return { ...totals, balance: totals.income - totals.expense };
}

function mapCategoryRows(rows: { category: string; total: number }[]): CategoryTotal[] {
  return rows.map((row) => ({
    category: isValidCategoryForType(row.category, 'gasto') ? row.category : 'Otros',
    total: row.total,
  }));
}

/** Gastos por categoría (todo el tiempo). Solo type = 'gasto'. */
export async function getExpenseCategoryTotals(
  db: SqlDatabase,
  trackingStart: string | null = null
): Promise<CategoryTotal[]> {
  const rows = await db.getAllAsync<{ category: string; total: number }>(
    `SELECT category, SUM(amount) as total FROM movements
     WHERE type = 'gasto' AND (? IS NULL OR created_at >= ?)
     GROUP BY category ORDER BY total DESC`,
    [trackingStart, trackingStart]
  );
  return mapCategoryRows(rows);
}

/** Gastos por categoría en un rango [start, end) de fechas ISO. Solo type = 'gasto'. Consulta base reutilizable. */
export async function getExpenseCategoryTotalsForRange(
  db: SqlDatabase,
  range: DateRange,
  trackingStart: string | null = null
): Promise<CategoryTotal[]> {
  const rows = await db.getAllAsync<{ category: string; total: number }>(
    `SELECT category, SUM(amount) as total FROM movements
     WHERE type = 'gasto' AND created_at >= ? AND created_at < ?
       AND (? IS NULL OR created_at >= ?)
     GROUP BY category ORDER BY total DESC`,
    [range.start, range.end, trackingStart, trackingStart]
  );
  return mapCategoryRows(rows);
}

/** Gastos por categoría de un mes específico (YYYY-MM). Solo type = 'gasto'. */
export async function getExpenseCategoryTotalsForMonth(
  db: SqlDatabase,
  monthKey: string,
  trackingStart: string | null = null
): Promise<CategoryTotal[]> {
  return getExpenseCategoryTotalsForRange(db, monthRange(monthKey), trackingStart);
}

/** Gastos por categoría del mes en curso. Solo type = 'gasto'. `now` inyectable para test. */
export async function getCurrentMonthExpenseCategoryTotals(
  db: SqlDatabase,
  trackingStart: string | null = null,
  now: Date = new Date()
): Promise<CategoryTotal[]> {
  return getExpenseCategoryTotalsForRange(db, currentMonthRange(now), trackingStart);
}

/** Fecha del primer movimiento elegible (ingreso/gasto) desde trackingStart, o null si no hay ninguno. */
async function getEarliestEligibleMovementDate(
  db: SqlDatabase,
  trackingStart: string | null
): Promise<string | null> {
  const row = await db.getFirstAsync<{ earliest: string | null }>(
    `SELECT MIN(created_at) as earliest FROM movements
     WHERE type IN ('gasto','ingreso') AND (? IS NULL OR created_at >= ?)`,
    [trackingStart, trackingStart]
  );
  return row?.earliest ?? null;
}

function monthsBetweenInclusive(fromYear: number, fromMonthIndex: number, to: Date): number {
  return (to.getFullYear() - fromYear) * 12 + (to.getMonth() - fromMonthIndex) + 1;
}

/** Extrae año y mes (0-indexado) de la parte YYYY-MM de un ISO, sin pasar por Date (evita corrimientos de zona horaria). */
function yearMonthFromIsoDate(iso: string): { year: number; monthIndex: number } {
  return { year: Number(iso.slice(0, 4)), monthIndex: Number(iso.slice(5, 7)) - 1 };
}

/** Tendencia mensual de ingresos y gastos reales (excluye transferencias y ajustes). */
export async function getMonthlyTrend(
  db: SqlDatabase,
  range: TrendRange = 6,
  trackingStart: string | null = null,
  now: Date = new Date()
): Promise<MonthlyTrendPoint[]> {
  let monthsBack: number;
  if (range === 'all') {
    const earliest = await getEarliestEligibleMovementDate(db, trackingStart);
    if (earliest) {
      const { year, monthIndex } = yearMonthFromIsoDate(earliest);
      monthsBack = Math.max(1, monthsBetweenInclusive(year, monthIndex, now));
    } else {
      monthsBack = 1;
    }
  } else {
    monthsBack = range;
  }
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1).toISOString();

  const rows = await db.getAllAsync<{ month: string; type: string; total: number }>(
    `SELECT strftime('%Y-%m', created_at) as month, type, SUM(amount) as total
     FROM movements
     WHERE created_at >= ? AND type IN ('gasto','ingreso')
       AND (? IS NULL OR created_at >= ?)
     GROUP BY month, type`,
    [rangeStart, trackingStart, trackingStart]
  );

  const totalsByMonth = new Map<string, { income: number; expense: number }>();
  for (const row of rows) {
    const entry = totalsByMonth.get(row.month) ?? { income: 0, expense: 0 };
    if (row.type === 'ingreso') entry.income += row.total;
    else if (row.type === 'gasto') entry.expense += row.total;
    totalsByMonth.set(row.month, entry);
  }

  const points: MonthlyTrendPoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const totals = totalsByMonth.get(monthKey) ?? { income: 0, expense: 0 };
    points.push({
      monthKey,
      monthLabel: date.toLocaleDateString('es-AR', { month: 'short' }).replace('.', ''),
      income: totals.income,
      expense: totals.expense,
    });
  }
  return points;
}
