import { normalizeName } from '../domain/normalize';
import { DEFAULT_FUND_COLOR, DEFAULT_FUND_ICON } from '../fundVisuals';
import type { SqlDatabase } from './sqlDatabase';

export const SCHEMA_VERSION = 4;
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

// financial_preferences guarda una única fila fija (id = 1) con la meta de ahorro activa.
const CREATE_FINANCIAL_PREFERENCES = `
  CREATE TABLE IF NOT EXISTS financial_preferences (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    savings_goal_enabled INTEGER NOT NULL DEFAULT 0,
    savings_goal_mode TEXT CHECK (savings_goal_mode IN ('fixed_amount','income_percentage')),
    savings_goal_value REAL,
    updated_at TEXT NOT NULL
  );
`;

const CREATE_CATEGORY_FINANCIAL_SETTINGS = `
  CREATE TABLE IF NOT EXISTS category_financial_settings (
    category TEXT PRIMARY KEY,
    spending_priority TEXT NOT NULL CHECK (spending_priority IN ('essential','flexible','discretionary')),
    updated_at TEXT NOT NULL
  );
`;

// financial_advice_cache guarda únicamente el último análisis (fila fija id = 1), no un historial.
const CREATE_FINANCIAL_ADVICE_CACHE = `
  CREATE TABLE IF NOT EXISTS financial_advice_cache (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    period_preset TEXT NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    comparison_enabled INTEGER NOT NULL DEFAULT 1,
    provider TEXT NOT NULL,
    snapshot_hash TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    advice_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

// Reglas de gastos recurrentes mensuales (el patrón general).
const CREATE_RECURRING_RULES = `
  CREATE TABLE IF NOT EXISTS recurring_expense_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    amount_mode TEXT NOT NULL CHECK (amount_mode IN ('fixed','estimated','unknown')),
    amount REAL,
    fund_assignment_mode TEXT NOT NULL CHECK (fund_assignment_mode IN ('fixed','ask_on_payment')),
    fund_id INTEGER,
    day_of_month INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 31),
    start_date TEXT NOT NULL,
    end_date TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE RESTRICT,
    CHECK (
      (amount_mode IN ('fixed','estimated') AND amount IS NOT NULL AND amount > 0)
      OR (amount_mode = 'unknown' AND amount IS NULL)
    ),
    CHECK (
      (fund_assignment_mode = 'fixed' AND fund_id IS NOT NULL)
      OR (fund_assignment_mode = 'ask_on_payment' AND fund_id IS NULL)
    ),
    CHECK (end_date IS NULL OR end_date >= start_date)
  );
`;

// Ocurrencias mensuales concretas (el gasto proyectado de un mes puntual).
// status='deleted' es un tombstone interno (nunca expuesto en StoredOccurrenceStatus):
// mantiene la fila para que ensureOccurrencesForMonth no la regenere, pero las queries
// de lectura la excluyen.
const CREATE_RECURRING_OCCURRENCES = `
  CREATE TABLE IF NOT EXISTS recurring_expense_occurrences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_id INTEGER NOT NULL,
    occurrence_month TEXT NOT NULL,
    original_scheduled_date TEXT NOT NULL,
    scheduled_date TEXT NOT NULL,
    projected_amount REAL,
    category TEXT NOT NULL,
    fund_assignment_mode TEXT NOT NULL CHECK (fund_assignment_mode IN ('fixed','ask_on_payment')),
    fund_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','skipped','cancelled','deleted')),
    linked_movement_id INTEGER,
    is_manually_modified INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (rule_id, occurrence_month),
    FOREIGN KEY (rule_id) REFERENCES recurring_expense_rules(id) ON DELETE RESTRICT,
    FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE RESTRICT,
    FOREIGN KEY (linked_movement_id) REFERENCES movements(id) ON DELETE SET NULL
  );
`;

const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_movements_source ON movements(source_fund_id);
  CREATE INDEX IF NOT EXISTS idx_movements_destination ON movements(destination_fund_id);
  CREATE INDEX IF NOT EXISTS idx_movements_created_at ON movements(created_at);
  CREATE INDEX IF NOT EXISTS idx_fund_aliases_normalized ON fund_aliases(normalized_alias);
  CREATE INDEX IF NOT EXISTS idx_fund_aliases_fund ON fund_aliases(fund_id);
  CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_month ON recurring_expense_occurrences(occurrence_month);
  CREATE INDEX IF NOT EXISTS idx_recurring_occurrences_rule ON recurring_expense_occurrences(rule_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_occurrences_movement
    ON recurring_expense_occurrences(linked_movement_id) WHERE linked_movement_id IS NOT NULL;
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
 * Reconstruye recurring_expense_occurrences para permitir status='deleted'
 * (SQLite no soporta ALTER de un CHECK existente). Preserva todas las filas.
 */
async function migrateOccurrencesAllowDeletedStatus(db: SqlDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE recurring_expense_occurrences_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER NOT NULL,
      occurrence_month TEXT NOT NULL,
      original_scheduled_date TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      projected_amount REAL,
      category TEXT NOT NULL,
      fund_assignment_mode TEXT NOT NULL CHECK (fund_assignment_mode IN ('fixed','ask_on_payment')),
      fund_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','skipped','cancelled','deleted')),
      linked_movement_id INTEGER,
      is_manually_modified INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (rule_id, occurrence_month),
      FOREIGN KEY (rule_id) REFERENCES recurring_expense_rules(id) ON DELETE RESTRICT,
      FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE RESTRICT,
      FOREIGN KEY (linked_movement_id) REFERENCES movements(id) ON DELETE SET NULL
    );
    INSERT INTO recurring_expense_occurrences_new SELECT * FROM recurring_expense_occurrences;
    DROP TABLE recurring_expense_occurrences;
    ALTER TABLE recurring_expense_occurrences_new RENAME TO recurring_expense_occurrences;
  `);
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
    await db.execAsync(CREATE_FINANCIAL_PREFERENCES);
    await db.execAsync(CREATE_CATEGORY_FINANCIAL_SETTINGS);
    await db.execAsync(CREATE_FINANCIAL_ADVICE_CACHE);
    await db.execAsync(CREATE_RECURRING_RULES);

    if (userVersion < 4 && (await tableExists(db, 'recurring_expense_occurrences'))) {
      await migrateOccurrencesAllowDeletedStatus(db);
    }
    await db.execAsync(CREATE_RECURRING_OCCURRENCES);
    await db.execAsync(CREATE_INDEXES);

    const efectivoId = await ensureDefaultFund(db, now);

    if (userVersion < 1 && (await tableExists(db, 'expenses'))) {
      await migrateLegacyExpenses(db, efectivoId);
    }

    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  });
}
