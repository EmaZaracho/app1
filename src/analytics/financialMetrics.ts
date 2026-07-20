import { isValidCategoryForType, type ExpenseCategory } from '../types';
import type { ActivityStats, PeriodFinancials } from '../types/financialAnalytics';
import { safeDivide } from '../domain/money';
import type { SqlDatabase } from '../db/sqlDatabase';

export interface DateRangeInput {
  start: string;
  end: string;
}

/**
 * Ingresos, gastos, ahorro operativo y ajustes netos de un rango. Solo
 * `type='ingreso'`/`type='gasto'` cuentan como ingreso/gasto; las
 * transferencias nunca alteran el ahorro; los ajustes se reportan aparte en
 * `adjustmentsNet` y no se suman al ahorro operativo.
 */
export async function getPeriodFinancials(
  db: SqlDatabase,
  range: DateRangeInput
): Promise<PeriodFinancials & { adjustmentsNet: number }> {
  const row = await db.getFirstAsync<{
    income: number;
    expense: number;
    adj_in: number;
    adj_out: number;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END), 0) AS income,
       COALESCE(SUM(CASE WHEN type = 'gasto' THEN amount ELSE 0 END), 0) AS expense,
       COALESCE(SUM(CASE WHEN type = 'ajuste' AND destination_fund_id IS NOT NULL THEN amount ELSE 0 END), 0) AS adj_in,
       COALESCE(SUM(CASE WHEN type = 'ajuste' AND source_fund_id IS NOT NULL THEN amount ELSE 0 END), 0) AS adj_out
     FROM movements WHERE created_at >= ? AND created_at < ?`,
    [range.start, range.end]
  );
  const income = row?.income ?? 0;
  const expense = row?.expense ?? 0;
  const operationalSavings = income - expense;
  return {
    income,
    expense,
    operationalSavings,
    savingsRate: safeDivide(operationalSavings, income),
    adjustmentsNet: (row?.adj_in ?? 0) - (row?.adj_out ?? 0),
  };
}

export interface CategoryAmount {
  category: ExpenseCategory;
  amount: number;
}

/** Gastos por categoría (solo `type='gasto'`) dentro del rango. */
export async function getPeriodExpenseCategoryTotals(
  db: SqlDatabase,
  range: DateRangeInput
): Promise<CategoryAmount[]> {
  const rows = await db.getAllAsync<{ category: string; total: number }>(
    `SELECT category, SUM(amount) as total FROM movements
     WHERE type = 'gasto' AND created_at >= ? AND created_at < ?
     GROUP BY category ORDER BY total DESC`,
    [range.start, range.end]
  );
  return rows.map((r) => ({
    category: (isValidCategoryForType(r.category, 'gasto') ? r.category : 'Otros') as ExpenseCategory,
    amount: r.total,
  }));
}

/** Actividad del período: solo gastos e ingresos cuentan (las transferencias no inflan la muestra). */
export async function getPeriodActivity(db: SqlDatabase, range: DateRangeInput): Promise<ActivityStats> {
  const row = await db.getFirstAsync<{
    expense_count: number;
    income_count: number;
    avg_expense: number | null;
    max_expense: number | null;
  }>(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'gasto' THEN 1 ELSE 0 END), 0) AS expense_count,
       COALESCE(SUM(CASE WHEN type = 'ingreso' THEN 1 ELSE 0 END), 0) AS income_count,
       AVG(CASE WHEN type = 'gasto' THEN amount END) AS avg_expense,
       MAX(CASE WHEN type = 'gasto' THEN amount END) AS max_expense
     FROM movements
     WHERE created_at >= ? AND created_at < ? AND type IN ('gasto','ingreso')`,
    [range.start, range.end]
  );
  const expenseCount = row?.expense_count ?? 0;
  const incomeCount = row?.income_count ?? 0;
  return {
    movementCount: expenseCount + incomeCount,
    expenseCount,
    incomeCount,
    averageExpense: row?.avg_expense ?? 0,
    largestExpense: row?.max_expense ?? 0,
  };
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Días distintos (calendario LOCAL, no UTC) con al menos un gasto o ingreso
 * en el rango. Se calcula en JS en vez de `strftime` de SQLite porque
 * `created_at` se guarda en UTC y `strftime` opera en UTC, lo que podría
 * atribuir un movimiento cercano a medianoche al día local incorrecto.
 */
export async function getPeriodActiveDays(db: SqlDatabase, range: DateRangeInput): Promise<number> {
  const rows = await db.getAllAsync<{ created_at: string }>(
    `SELECT created_at FROM movements
     WHERE created_at >= ? AND created_at < ? AND type IN ('gasto','ingreso')`,
    [range.start, range.end]
  );
  const days = new Set(rows.map((r) => localDateKey(new Date(r.created_at))));
  return days.size;
}
