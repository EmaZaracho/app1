import { initDatabase } from '../src/db/schema';
import type { SqlDatabase } from '../src/db/sqlDatabase';
import { createTestDb } from './betterSqliteAdapter';

/** Crea una base inicializada (esquema + fondo Efectivo). */
export async function freshDb(): Promise<SqlDatabase> {
  const { db } = createTestDb();
  await initDatabase(db);
  return db;
}

/** Crea una base con la tabla legacy `expenses` poblada, SIN migrar todavía. */
export async function legacyDb(rows: LegacyExpense[]): Promise<SqlDatabase> {
  const { db } = createTestDb();
  await db.execAsync(`
    CREATE TABLE expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'gasto',
      amount REAL NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  for (const row of rows) {
    await db.runAsync(
      'INSERT INTO expenses (id, type, amount, category, description, raw_text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [row.id, row.type, row.amount, row.category, row.description, row.rawText, row.createdAt]
    );
  }
  return db;
}

export interface LegacyExpense {
  id: number;
  type: 'gasto' | 'ingreso';
  amount: number;
  category: string;
  description: string;
  rawText: string;
  createdAt: string;
}
