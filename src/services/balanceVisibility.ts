import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'balance_visibility';

export async function getBalanceVisibility(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(STORAGE_KEY);
  return value !== 'hidden';
}

export async function setBalanceVisibility(visible: boolean): Promise<void> {
  await SecureStore.setItemAsync(STORAGE_KEY, visible ? 'visible' : 'hidden');
}
