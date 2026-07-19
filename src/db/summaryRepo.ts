import { isValidCategoryForType, type Category } from '../types';
import { currentMonthRange } from './dateRange';
import type { SqlDatabase } from './sqlDatabase';

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

function mapCategoryRows(rows: { category: string; total: number }[]): CategoryTotal[] {
  return rows.map((row) => ({
    category: isValidCategoryForType(row.category, 'gasto') ? row.category : 'Otros',
    total: row.total,
  }));
}

/** Gastos por categoría (todo el tiempo). Solo type = 'gasto'. */
export async function getExpenseCategoryTotals(db: SqlDatabase): Promise<CategoryTotal[]> {
  const rows = await db.getAllAsync<{ category: string; total: number }>(
    "SELECT category, SUM(amount) as total FROM movements WHERE type = 'gasto' GROUP BY category ORDER BY total DESC"
  );
  return mapCategoryRows(rows);
}

/** Gastos por categoría del mes en curso. Solo type = 'gasto'. */
export async function getCurrentMonthExpenseCategoryTotals(
  db: SqlDatabase
): Promise<CategoryTotal[]> {
  const { start, end } = currentMonthRange();
  const rows = await db.getAllAsync<{ category: string; total: number }>(
    "SELECT category, SUM(amount) as total FROM movements WHERE type = 'gasto' AND created_at >= ? AND created_at < ? GROUP BY category ORDER BY total DESC",
    [start, end]
  );
  return mapCategoryRows(rows);
}

/** Tendencia mensual de ingresos y gastos reales (excluye transferencias y ajustes). */
export async function getMonthlyTrend(
  db: SqlDatabase,
  monthsBack = 6
): Promise<MonthlyTrendPoint[]> {
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1).toISOString();

  const rows = await db.getAllAsync<{ month: string; type: string; total: number }>(
    `SELECT strftime('%Y-%m', created_at) as month, type, SUM(amount) as total
     FROM movements
     WHERE created_at >= ? AND type IN ('gasto','ingreso')
     GROUP BY month, type`,
    [rangeStart]
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
