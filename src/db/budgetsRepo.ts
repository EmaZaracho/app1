import { isValidCategoryForType, type Budget, type ExpenseCategory } from '../types';
import { budgetRange, isBudgetPeriod, type BudgetPeriod } from '../domain/budgetPeriod';
import { getExpenseCategoryTotalsForRange } from './summaryRepo';
import type { SqlDatabase } from './sqlDatabase';

export interface BudgetAlert {
  category: ExpenseCategory;
  spent: number;
  limit: number;
  period: BudgetPeriod;
}

export async function getBudgets(db: SqlDatabase): Promise<Budget[]> {
  const rows = await db.getAllAsync<{
    category: string;
    monthly_limit: number;
    period: string | null;
    anchor_date: string | null;
  }>('SELECT category, monthly_limit, period, anchor_date FROM budgets');
  return rows
    .filter((row) => isValidCategoryForType(row.category, 'gasto'))
    .map((row) => ({
      category: row.category as ExpenseCategory,
      limit: row.monthly_limit,
      period: row.period && isBudgetPeriod(row.period) ? row.period : 'monthly',
      anchorDate: row.anchor_date,
    }));
}

/**
 * Guarda el presupuesto de una categoría (uno por categoría). `monthly_limit` es
 * el nombre histórico de la columna: guarda el límite del período elegido.
 */
export async function setBudget(
  db: SqlDatabase,
  category: ExpenseCategory,
  limit: number,
  period: BudgetPeriod = 'monthly',
  anchorDate: string | null = null
): Promise<void> {
  if (limit <= 0) {
    await db.runAsync('DELETE FROM budgets WHERE category = ?', [category]);
    return;
  }
  await db.runAsync(
    `INSERT INTO budgets (category, monthly_limit, period, anchor_date) VALUES (?, ?, ?, ?)
     ON CONFLICT(category) DO UPDATE SET
       monthly_limit = excluded.monthly_limit,
       period = excluded.period,
       anchor_date = excluded.anchor_date`,
    [category, limit, period, period === 'monthly' ? null : anchorDate]
  );
}

/** Gasto real de la categoría del presupuesto dentro de su ciclo actual. */
export async function getBudgetSpentByCategory(
  db: SqlDatabase,
  budgets: Budget[],
  trackingStart: string | null = null,
  now: Date = new Date()
): Promise<Map<ExpenseCategory, number>> {
  const spent = new Map<ExpenseCategory, number>();
  // Una consulta por rango distinto, no por presupuesto.
  const totalsByRange = new Map<string, Map<string, number>>();
  for (const budget of budgets) {
    const range = budgetRange(budget.period, budget.anchorDate, now);
    const key = `${range.start}|${range.end}`;
    let totals = totalsByRange.get(key);
    if (!totals) {
      const rows = await getExpenseCategoryTotalsForRange(db, range, trackingStart);
      totals = new Map(rows.map((r) => [r.category, r.total]));
      totalsByRange.set(key, totals);
    }
    spent.set(budget.category, totals.get(budget.category) ?? 0);
  }
  return spent;
}

/** Desde qué fracción del límite se avisa que el presupuesto está por agotarse. */
export const BUDGET_WARNING_RATIO = 0.8;

export interface BudgetProgress extends BudgetAlert {
  /** Gasto / límite (puede pasar de 1). */
  ratio: number;
  /** 'exceeded' si el gasto supera el límite; 'near' si llegó al umbral de aviso sin superarlo. */
  status: 'near' | 'exceeded';
}

/**
 * Presupuestos que están cerca de agotarse o ya superados en su ciclo actual,
 * del más avanzado al menos. Solo considera gastos reales (type = 'gasto').
 */
export async function getBudgetProgress(
  db: SqlDatabase,
  trackingStart: string | null = null,
  now: Date = new Date()
): Promise<BudgetProgress[]> {
  const budgets = await getBudgets(db);
  const spentByCategory = await getBudgetSpentByCategory(db, budgets, trackingStart, now);
  const progress: BudgetProgress[] = [];
  for (const budget of budgets) {
    const spent = spentByCategory.get(budget.category) ?? 0;
    const ratio = budget.limit > 0 ? spent / budget.limit : 0;
    const status = spent > budget.limit ? 'exceeded' : ratio >= BUDGET_WARNING_RATIO ? 'near' : null;
    if (status) {
      progress.push({ category: budget.category, spent, limit: budget.limit, period: budget.period, ratio, status });
    }
  }
  return progress.sort((a, b) => b.ratio - a.ratio);
}

/**
 * Presupuestos superados en su ciclo actual. Solo considera gastos reales (type = 'gasto');
 * transferencias y ajustes nunca disparan alertas de presupuesto.
 */
export async function getBudgetAlerts(
  db: SqlDatabase,
  trackingStart: string | null = null,
  now: Date = new Date()
): Promise<BudgetAlert[]> {
  const budgets = await getBudgets(db);
  const spentByCategory = await getBudgetSpentByCategory(db, budgets, trackingStart, now);
  return budgets
    .map((budget) => ({
      category: budget.category,
      spent: spentByCategory.get(budget.category) ?? 0,
      limit: budget.limit,
      period: budget.period,
    }))
    .filter((alert) => alert.spent > alert.limit);
}
