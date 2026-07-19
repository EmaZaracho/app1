import { isValidCategoryForType, type Budget, type ExpenseCategory } from '../types';
import { getCurrentMonthExpenseCategoryTotals } from './summaryRepo';
import type { SqlDatabase } from './sqlDatabase';

export interface BudgetAlert {
  category: ExpenseCategory;
  spent: number;
  limit: number;
}

export async function getBudgets(db: SqlDatabase): Promise<Budget[]> {
  const rows = await db.getAllAsync<{ category: string; monthly_limit: number }>(
    'SELECT category, monthly_limit FROM budgets'
  );
  return rows
    .filter((row) => isValidCategoryForType(row.category, 'gasto'))
    .map((row) => ({ category: row.category as ExpenseCategory, monthlyLimit: row.monthly_limit }));
}

export async function setBudget(
  db: SqlDatabase,
  category: ExpenseCategory,
  monthlyLimit: number
): Promise<void> {
  if (monthlyLimit <= 0) {
    await db.runAsync('DELETE FROM budgets WHERE category = ?', [category]);
    return;
  }
  await db.runAsync(
    'INSERT INTO budgets (category, monthly_limit) VALUES (?, ?) ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit',
    [category, monthlyLimit]
  );
}

/**
 * Presupuestos superados este mes. Solo considera gastos reales (type = 'gasto');
 * transferencias y ajustes nunca disparan alertas de presupuesto.
 */
export async function getBudgetAlerts(db: SqlDatabase): Promise<BudgetAlert[]> {
  const [budgets, totals] = await Promise.all([
    getBudgets(db),
    getCurrentMonthExpenseCategoryTotals(db),
  ]);
  const spentByCategory = new Map(totals.map((t) => [t.category, t.total]));
  return budgets
    .map((budget) => ({
      category: budget.category,
      spent: spentByCategory.get(budget.category) ?? 0,
      limit: budget.monthlyLimit,
    }))
    .filter((alert) => alert.spent > alert.limit);
}
