import type { SQLiteDatabase } from 'expo-sqlite';

export type SqlValue = string | number | null;

export interface SqlRunResult {
  lastInsertRowId: number;
  changes: number;
}

/**
 * Interfaz mínima de base de datos que usan los repositorios y migraciones.
 * expo-sqlite la implementa en la app; un adaptador sobre better-sqlite3 la
 * implementa en las pruebas. De esta forma la lógica productiva no se duplica.
 */
export interface SqlDatabase {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params?: SqlValue[]): Promise<SqlRunResult>;
  getAllAsync<T>(source: string, params?: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params?: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}

/** Envuelve una SQLiteDatabase de expo-sqlite en la interfaz SqlDatabase. */
export function fromExpo(db: SQLiteDatabase): SqlDatabase {
  return {
    execAsync: (source) => db.execAsync(source),
    runAsync: (source, params = []) => db.runAsync(source, params),
    getAllAsync: <T>(source: string, params: SqlValue[] = []) => db.getAllAsync<T>(source, params),
    getFirstAsync: <T>(source: string, params: SqlValue[] = []) =>
      db.getFirstAsync<T>(source, params),
    withTransactionAsync: (task) => db.withTransactionAsync(task),
  };
}
