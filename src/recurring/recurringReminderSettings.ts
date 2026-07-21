import * as SecureStore from 'expo-secure-store';

const KEY = 'recurring_reminders_enabled';

/** Preferencia global de recordatorios (una sola, no por regla). */
export async function getRemindersEnabled(): Promise<boolean> {
  const stored = await SecureStore.getItemAsync(KEY);
  return stored === '1';
}

export async function setRemindersEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY, enabled ? '1' : '0');
}
