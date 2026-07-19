import type { SQLiteDatabase } from 'expo-sqlite';
import { fromExpo } from './sqlDatabase';
import { initDatabase as initSchema } from './schema';

/** Punto de entrada para SQLiteProvider.onInit: envuelve la DB real y migra. */
export async function initDatabase(raw: SQLiteDatabase): Promise<void> {
  await initSchema(fromExpo(raw));
}

export type { SqlDatabase } from './sqlDatabase';

export * from './balances';
export * from './fundsRepo';
export * from './movementsRepo';
export * from './summaryRepo';
export * from './budgetsRepo';
