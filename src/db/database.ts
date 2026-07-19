import type { SQLiteDatabase } from 'expo-sqlite';
import { CATEGORIES, type Category, type Expense, type ParsedExpense } from '../types';

export async function initDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

function rowToExpense(row: any): Expense {
  return {
    id: row.id,
    amount: row.amount,
    category: CATEGORIES.includes(row.category) ? row.category : 'Otros',
    description: row.description,
    rawText: row.raw_text,
    createdAt: row.created_at,
  };
}

export async function addExpense(
  db: SQLiteDatabase,
  parsed: ParsedExpense,
  rawText: string
): Promise<Expense> {
  const createdAt = new Date().toISOString();
  const result = await db.runAsync(
    'INSERT INTO expenses (amount, category, description, raw_text, created_at) VALUES (?, ?, ?, ?, ?)',
    [parsed.amount, parsed.category, parsed.description, rawText, createdAt]
  );
  return {
    id: result.lastInsertRowId,
    amount: parsed.amount,
    category: parsed.category,
    description: parsed.description,
    rawText,
    createdAt,
  };
}

export async function getExpenses(db: SQLiteDatabase): Promise<Expense[]> {
  const rows = await db.getAllAsync('SELECT * FROM expenses ORDER BY id DESC');
  return rows.map(rowToExpense);
}

export async function getExpenseById(db: SQLiteDatabase, id: number): Promise<Expense | null> {
  const row = await db.getFirstAsync('SELECT * FROM expenses WHERE id = ?', [id]);
  return row ? rowToExpense(row) : null;
}

export async function updateExpense(
  db: SQLiteDatabase,
  id: number,
  parsed: ParsedExpense
): Promise<void> {
  await db.runAsync(
    'UPDATE expenses SET amount = ?, category = ?, description = ? WHERE id = ?',
    [parsed.amount, parsed.category, parsed.description, id]
  );
}

export async function deleteExpense(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);
}

export async function restoreExpense(db: SQLiteDatabase, expense: Expense): Promise<void> {
  await db.runAsync(
    'INSERT INTO expenses (id, amount, category, description, raw_text, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [expense.id, expense.amount, expense.category, expense.description, expense.rawText, expense.createdAt]
  );
}

export interface CategoryTotal {
  category: Category;
  total: number;
}

export async function getTotalsByCategory(db: SQLiteDatabase): Promise<CategoryTotal[]> {
  const rows = await db.getAllAsync<{ category: string; total: number }>(
    'SELECT category, SUM(amount) as total FROM expenses GROUP BY category ORDER BY total DESC'
  );
  return rows.map((row) => ({
    category: CATEGORIES.includes(row.category as Category) ? (row.category as Category) : 'Otros',
    total: row.total,
  }));
}

export async function getGrandTotal(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(amount) as total FROM expenses'
  );
  return row?.total ?? 0;
}

export async function getCurrentMonthTotal(db: SQLiteDatabase): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  const row = await db.getFirstAsync<{ total: number | null }>(
    'SELECT SUM(amount) as total FROM expenses WHERE created_at >= ? AND created_at < ?',
    [monthStart, monthEnd]
  );
  return row?.total ?? 0;
}
