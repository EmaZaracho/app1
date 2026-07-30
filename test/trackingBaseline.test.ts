import { getTrackingStart, setTrackingStart } from '../src/db/financialPreferencesRepository';
import { initDatabase } from '../src/db/schema';
import { createTestDb } from './betterSqliteAdapter';
import { freshDb } from './helpers';

describe('línea base del seguimiento', () => {
  it('se puede guardar y quitar sin tocar los demás datos', async () => {
    const db = await freshDb();
    const start = new Date(2026, 6, 10).toISOString();

    expect(await getTrackingStart(db)).toBeNull();

    await setTrackingStart(db, start);
    expect(await getTrackingStart(db)).toBe(start);

    await setTrackingStart(db, null);
    expect(await getTrackingStart(db)).toBeNull();
  });

  it('migra una base previa sin perder sus preferencias existentes', async () => {
    const { db } = createTestDb();
    await db.execAsync(`
      CREATE TABLE financial_preferences (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        savings_goal_enabled INTEGER NOT NULL DEFAULT 0,
        savings_goal_mode TEXT,
        savings_goal_value REAL,
        updated_at TEXT NOT NULL
      );
      PRAGMA user_version = 4;
    `);
    await db.runAsync(
      'INSERT INTO financial_preferences (id, savings_goal_enabled, savings_goal_mode, savings_goal_value, updated_at) VALUES (1, 1, ?, ?, ?)',
      ['fixed_amount', 10000, new Date(2026, 6, 1).toISOString()]
    );

    await initDatabase(db);

    expect(await getTrackingStart(db)).toBeNull();
    const row = await db.getFirstAsync<{ savings_goal_enabled: number; savings_goal_value: number }>(
      'SELECT savings_goal_enabled, savings_goal_value FROM financial_preferences WHERE id = 1'
    );
    expect(row).toEqual({ savings_goal_enabled: 1, savings_goal_value: 10000 });
  });
});