import { useMemo } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { fromExpo, type SqlDatabase } from './sqlDatabase';

/**
 * Devuelve la base de datos envuelta en la interfaz SqlDatabase que usan los
 * repositorios. Memoizada por la referencia estable de expo-sqlite.
 */
export function useDb(): SqlDatabase {
  const raw = useSQLiteContext();
  return useMemo(() => fromExpo(raw), [raw]);
}
