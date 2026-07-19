import { normalizeName } from '../domain/normalize';
import { DEFAULT_FUND_COLOR, DEFAULT_FUND_ICON } from '../fundVisuals';
import type { SqlDatabase } from './sqlDatabase';

export const SCHEMA_VERSION = 1;
export const DEFAULT_FUND_NAME = 'Efectivo';

const CREATE_FUNDS = `
  CREATE TABLE IF NOT EXISTS funds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

const CREATE_FUND_ALIASES = `
  CREATE TABLE IF NOT EXISTS fund_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fund_id INTEGER NOT NULL,
    alias TEXT NOT NULL,
    normalized_alias TEXT NOT NULL,
    FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE CASCADE
  );
`;

const CREATE_MOVEMENTS = `
  CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('gasto','ingreso','transferencia','ajuste')),
    amount REAL NOT NULL CHECK (amount > 0),
    category TEXT,
    description TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    source_fund_id INTEGER,
    destination_fund_id INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY (source_fund_id) REFERENCES funds(id) ON DELETE RESTRICT,
    FOREIGN KEY (destination_fund_id) REFERENCES funds(id) ON DELETE RESTRICT,
    CHECK (
      (type = 'gasto'
        AND source_fund_id IS NOT NULL AND destination_fund_id IS NULL AND category IS NOT NULL)
      OR (type = 'ingreso'
        AND source_fund_id IS NULL AND destination_fund_id IS NOT NULL AND category IS NOT NULL)
      OR (type = 'transferencia'
        AND source_fund_id IS NOT NULL AND destination_fund_id IS NOT NULL
        AND source_fund_id <> destination_fund_id AND category IS NULL)
      OR (type = 'ajuste'
        AND category IS NULL
        AND ((source_fund_id IS NOT NULL AND destination_fund_id IS NULL)
          OR (source_fund_id IS NULL AND destination_fund_id IS NOT NULL)))
    )
  );
`;

const CREATE_BUDGETS = `
  CREATE TABLE IF NOT EXISTS budgets (
    category TEXT PRIMARY KEY,
    monthly_limit REAL NOT NULL
  );
`;

const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_movements_source ON movements(source_fund_id);
  CREATE INDEX IF NOT EXISTS idx_movements_destination ON movements(destination_fund_id);
  CREATE INDEX IF NOT EXISTS idx_movements_created_at ON movements(created_at);
  CREATE INDEX IF NOT EXISTS idx_fund_aliases_normalized ON fund_aliases(normalized_alias);
  CREATE INDEX IF NOT EXISTS idx_fund_aliases_fund ON fund_aliases(fund_id);
`;

async function tableExists(db: SqlDatabase, name: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [name]
  );
  return !!row;
}

/**
 * Garantiza que exista al menos un fondo activo y exactamente un predeterminado.
 * Crea "Efectivo" si no hay ninguno. Devuelve el id del fondo predeterminado.
 */
async function ensureDefaultFund(db: SqlDatabase, now: string): Promise<number> {
  const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM funds');
  if ((count?.n ?? 0) === 0) {
    const result = await db.runAsync(
      `INSERT INTO funds (name, normalized_name, icon, color, is_default, is_archived, display_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 0, 0, ?, ?)`,
      [DEFAULT_FUND_NAME, normalizeName(DEFAULT_FUND_NAME), DEFAULT_FUND_ICON, DEFAULT_FUND_COLOR, now, now]
    );
    return result.lastInsertRowId;
  }

  // Ya hay fondos: asegurar que haya exactamente un predeterminado activo.
  const current = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM funds WHERE is_default = 1 AND is_archived = 0 ORDER BY display_order LIMIT 1'
  );
  if (current) {
    await db.runAsync('UPDATE funds SET is_default = 0 WHERE id <> ?', [current.id]);
    return current.id;
  }
  const fallback = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM funds WHERE is_archived = 0 ORDER BY display_order, id LIMIT 1'
  );
  if (fallback) {
    await db.runAsync('UPDATE funds SET is_default = 0', []);
    await db.runAsync('UPDATE funds SET is_default = 1 WHERE id = ?', [fallback.id]);
    return fallback.id;
  }
  // Todos archivados (no debería pasar): desarchivar el primero.
  const anyFund = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM funds ORDER BY display_order, id LIMIT 1'
  );
  if (anyFund) {
    await db.runAsync('UPDATE funds SET is_default = 0', []);
    await db.runAsync('UPDATE funds SET is_default = 1, is_archived = 0 WHERE id = ?', [anyFund.id]);
    return anyFund.id;
  }
  throw new Error('No se pudo asegurar un fondo predeterminado.');
}

/**
 * Migra la tabla legacy `expenses` a `movements`, asignando el fondo Efectivo
 * como origen de los gastos y destino de los ingresos. Preserva ids, montos,
 * categorías, descripciones, texto original y fechas. Verifica el conteo antes
 * de eliminar la tabla vieja. Todo corre dentro de la transacción del caller.
 */
async function migrateLegacyExpenses(db: SqlDatabase, efectivoId: number): Promise<void> {
  const expensesCount = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM expenses');
  const before = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM movements');
  const expected = expensesCount?.n ?? 0;

  await db.runAsync(
    `INSERT INTO movements (id, type, amount, category, description, raw_text, source_fund_id, destination_fund_id, created_at)
     SELECT
       id,
       type,
       amount,
       category,
       description,
       raw_text,
       CASE WHEN type = 'gasto' THEN ? ELSE NULL END,
       CASE WHEN type = 'ingreso' THEN ? ELSE NULL END,
       created_at
     FROM expenses`,
    [efectivoId, efectivoId]
  );

  const after = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) as n FROM movements');
  const migrated = (after?.n ?? 0) - (before?.n ?? 0);
  if (migrated !== expected) {
    throw new Error(
      `Migración inconsistente: se esperaban ${expected} movimientos y se migraron ${migrated}.`
    );
  }

  await db.execAsync('DROP TABLE expenses;');
}

/**
 * Inicializa la base de datos: activa WAL y foreign_keys, crea el esquema,
 * corre las migraciones versionadas de forma idempotente y atómica, y asegura
 * el fondo predeterminado. Reejecutar no duplica fondos ni movimientos.
 */
export async function initDatabase(db: SqlDatabase): Promise<void> {
  // Estos PRAGMA no pueden ir dentro de una transacción.
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const userVersion = versionRow?.user_version ?? 0;
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.execAsync(CREATE_FUNDS);
    await db.execAsync(CREATE_FUND_ALIASES);
    await db.execAsync(CREATE_MOVEMENTS);
    await db.execAsync(CREATE_BUDGETS);
    await db.execAsync(CREATE_INDEXES);

    const efectivoId = await ensureDefaultFund(db, now);

    if (userVersion < 1 && (await tableExists(db, 'expenses'))) {
      await migrateLegacyExpenses(db, efectivoId);
    }

    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  });
}
