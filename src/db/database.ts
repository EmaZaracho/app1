import type { SQLiteDatabase } from 'expo-sqlite';
import {
  isValidCategoryForType,
  type Budget,
  type Category,
  type ExpenseCategory,
  type Movement,
  type MovementType,
  type ParsedMovement,
} from '../types';

export async function initDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'gasto',
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS budgets (
      category TEXT PRIMARY KEY,
      monthly_limit REAL NOT NULL
    );
  `);

  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(expenses)');
  if (!columns.some((c) => c.name === 'type')) {
    await db.execAsync("ALTER TABLE expenses ADD COLUMN type TEXT NOT NULL DEFAULT 'gasto'");
  }
}

function rowToMovement(row: any): Movement {
  const type: MovementType = row.type === 'ingreso' ? 'ingreso' : 'gasto';
  return {
    id: row.id,
    type,
    amount: row.amount,
    category: isValidCategoryForType(row.category, type) ? row.category : 'Otros',
    description: row.description,
    rawText: row.raw_text,
    createdAt: row.created_at,
  };
}

export async function addMovement(
  db: SQLiteDatabase,
  parsed: ParsedMovement,
  rawText: string
): Promise<Movement> {
  const createdAt = new Date().toISOString();
  const result = await db.runAsync(
    'INSERT INTO expenses (type, amount, category, description, raw_text, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [parsed.type, parsed.amount, parsed.category, parsed.description, rawText, createdAt]
  );
  return {
    id: result.lastInsertRowId,
    type: parsed.type,
    amount: parsed.amount,
    category: parsed.category,
    description: parsed.description,
    rawText,
    createdAt,
  };
}

export async function getMovements(db: SQLiteDatabase): Promise<Movement[]> {
  const rows = await db.getAllAsync('SELECT * FROM expenses ORDER BY id DESC');
  return rows.map(rowToMovement);
}

export async function getMovementById(db: SQLiteDatabase, id: number): Promise<Movement | null> {
  const row = await db.getFirstAsync('SELECT * FROM expenses WHERE id = ?', [id]);
  return row ? rowToMovement(row) : null;
}

export async function updateMovement(
  db: SQLiteDatabase,
  id: number,
  parsed: ParsedMovement
): Promise<void> {
  await db.runAsync(
    'UPDATE expenses SET type = ?, amount = ?, category = ?, description = ? WHERE id = ?',
    [parsed.type, parsed.amount, parsed.category, parsed.description, id]
  );
}

export async function deleteMovement(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
}

export async function restoreMovement(db: SQLiteDatabase, movement: Movement): Promise<void> {
  await db.runAsync(
    'INSERT INTO expenses (id, type, amount, category, description, raw_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      movement.id,
      movement.type,
      movement.amount,
      movement.category,
      movement.description,
      movement.rawText,
      movement.createdAt,
    ]
  );
}

export interface CategoryTotal {
  category: Category;
  total: number;
}

export async function getExpenseCategoryTotals(db: SQLiteDatabase): Promise<CategoryTotal[]> {
  const rows = await db.getAllAsync<{ category: string; total: number }>(
    "SELECT category, SUM(amount) as total FROM expenses WHERE type = 'gasto' GROUP BY category ORDER BY total DESC"
  );
  return rows.map((row) => ({
    category: isValidCategoryForType(row.category, 'gasto') ? row.category : 'Otros',
    total: row.total,
  }));
}

export async function getCurrentMonthExpenseCategoryTotals(
  db: SQLiteDatabase
): Promise<CategoryTotal[]> {
  const { start, end } = currentMonthRange();
  const rows = await db.getAllAsync<{ category: string; total: number }>(
    "SELECT category, SUM(amount) as total FROM expenses WHERE type = 'gasto' AND created_at >= ? AND created_at < ? GROUP BY category ORDER BY total DESC",
    [start, end]
  );
  return rows.map((row) => ({
    category: isValidCategoryForType(row.category, 'gasto') ? row.category : 'Otros',
    total: row.total,
  }));
}

export interface PeriodTotals {
  income: number;
  expense: number;
  balance: number;
}

function rowsToPeriodTotals(rows: { type: string; total: number }[]): PeriodTotals {
  const income = rows.find((r) => r.type === 'ingreso')?.total ?? 0;
  const expense = rows.find((r) => r.type === 'gasto')?.total ?? 0;
  return { income, expense, balance: income - expense };
}

export async function getTotals(db: SQLiteDatabase): Promise<PeriodTotals> {
  const rows = await db.getAllAsync<{ type: string; total: number }>(
    'SELECT type, SUM(amount) as total FROM expenses GROUP BY type'
  );
  return rowsToPeriodTotals(rows);
}

function currentMonthRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { start, end };
}

export async function getCurrentMonthTotals(db: SQLiteDatabase): Promise<PeriodTotals> {
  const { start, end } = currentMonthRange();
  const rows = await db.getAllAsync<{ type: string; total: number }>(
    'SELECT type, SUM(amount) as total FROM expenses WHERE created_at >= ? AND created_at < ? GROUP BY type',
    [start, end]
  );
  return rowsToPeriodTotals(rows);
}

export interface MonthlyTrendPoint {
  monthKey: string;
  monthLabel: string;
  income: number;
  expense: number;
}

export async function getMonthlyTrend(
  db: SQLiteDatabase,
  monthsBack = 6
): Promise<MonthlyTrendPoint[]> {
  const now = new Date();
  const rangeStart = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1).toISOString();

  const rows = await db.getAllAsync<{ month: string; type: string; total: number }>(
    "SELECT strftime('%Y-%m', created_at) as month, type, SUM(amount) as total FROM expenses WHERE created_at >= ? GROUP BY month, type",
    [rangeStart]
  );

  const totalsByMonth = new Map<string, { income: number; expense: number }>();
  for (const row of rows) {
    const entry = totalsByMonth.get(row.month) ?? { income: 0, expense: 0 };
    if (row.type === 'ingreso') entry.income += row.total;
    else entry.expense += row.total;
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

export async function getBudgets(db: SQLiteDatabase): Promise<Budget[]> {
  const rows = await db.getAllAsync<{ category: string; monthly_limit: number }>(
    'SELECT category, monthly_limit FROM budgets'
  );
  return rows
    .filter((row) => isValidCategoryForType(row.category, 'gasto'))
    .map((row) => ({ category: row.category as ExpenseCategory, monthlyLimit: row.monthly_limit }));
}

export async function setBudget(
  db: SQLiteDatabase,
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

export interface BudgetAlert {
  category: ExpenseCategory;
  spent: number;
  limit: number;
}

export async function getBudgetAlerts(db: SQLiteDatabase): Promise<BudgetAlert[]> {
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
