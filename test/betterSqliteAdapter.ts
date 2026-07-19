import Database from 'better-sqlite3';
import type { SqlDatabase, SqlValue } from '../src/db/sqlDatabase';

/**
 * Adaptador de la interfaz SqlDatabase sobre better-sqlite3 (síncrono) para
 * ejecutar los repositorios reales en Node durante las pruebas. No duplica
 * lógica productiva: corre exactamente las mismas consultas.
 */
export function createTestDb(): { db: SqlDatabase; raw: Database.Database } {
  const raw = new Database(':memory:');

  const db: SqlDatabase = {
    async execAsync(source: string) {
      raw.exec(source);
    },
    async runAsync(source: string, params: SqlValue[] = []) {
      const result = raw.prepare(source).run(...params);
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: result.changes,
      };
    },
    async getAllAsync<T>(source: string, params: SqlValue[] = []): Promise<T[]> {
      return raw.prepare(source).all(...params) as T[];
    },
    async getFirstAsync<T>(source: string, params: SqlValue[] = []): Promise<T | null> {
      const row = raw.prepare(source).get(...params);
      return (row as T) ?? null;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
  };

  return { db, raw };
}
