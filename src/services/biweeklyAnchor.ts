import * as SecureStore from 'expo-secure-store';
import { DEFAULT_BIWEEKLY_ANCHOR } from '../domain/biweeklyCycle';

const STORAGE_KEY = 'summary_biweekly_anchor';

/** Domingo (YYYY-MM-DD) desde el que se cuentan los ciclos de 2 semanas del Resumen. */
export async function getBiweeklyAnchor(): Promise<string> {
  const value = await SecureStore.getItemAsync(STORAGE_KEY);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : DEFAULT_BIWEEKLY_ANCHOR;
}

export async function setBiweeklyAnchor(anchor: string): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, anchor);
}
