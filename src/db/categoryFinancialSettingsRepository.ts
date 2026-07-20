import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types';
import type { SpendingPriority } from '../types/financialAnalytics';
import type { SqlDatabase } from './sqlDatabase';

/** Clasificación inicial razonable; queda editable desde Configuración. */
export const DEFAULT_CATEGORY_PRIORITY: Record<ExpenseCategory, SpendingPriority> = {
  Vivienda: 'essential',
  Salud: 'essential',
  Servicios: 'essential',
  Comida: 'flexible',
  Transporte: 'flexible',
  Otros: 'flexible',
  Compras: 'discretionary',
  Entretenimiento: 'discretionary',
};

interface Row {
  category: string;
  spending_priority: string;
  updated_at: string;
}

/** Prioridad de cada categoría de gasto, sembrando el default la primera vez que se lee. */
export async function getCategoryPriorities(
  db: SqlDatabase
): Promise<{ category: ExpenseCategory; priority: SpendingPriority }[]> {
  const rows = await db.getAllAsync<Row>('SELECT * FROM category_financial_settings');
  const byCategory = new Map(rows.map((r) => [r.category, r.spending_priority as SpendingPriority]));
  return EXPENSE_CATEGORIES.map((category) => ({
    category,
    priority: byCategory.get(category) ?? DEFAULT_CATEGORY_PRIORITY[category],
  }));
}

export async function setCategoryPriority(
  db: SqlDatabase,
  category: ExpenseCategory,
  priority: SpendingPriority
): Promise<void> {
  await db.runAsync(
    `INSERT INTO category_financial_settings (category, spending_priority, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(category) DO UPDATE SET spending_priority = excluded.spending_priority, updated_at = excluded.updated_at`,
    [category, priority, new Date().toISOString()]
  );
}
