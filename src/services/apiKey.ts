import * as SecureStore from 'expo-secure-store';
import type { ApiProvider } from '../types';

const PROVIDER_STORAGE_KEY: Record<ApiProvider, string> = {
  deepseek: 'deepseek_api_key',
  gemini: 'gemini_api_key',
};

const ACTIVE_PROVIDER_STORAGE_KEY = 'active_api_provider';

export async function getApiKey(provider: ApiProvider): Promise<string | null> {
  return SecureStore.getItemAsync(PROVIDER_STORAGE_KEY[provider]);
}

export async function setApiKey(provider: ApiProvider, value: string): Promise<void> {
  await SecureStore.setItemAsync(PROVIDER_STORAGE_KEY[provider], value.trim());
}

export async function clearApiKey(provider: ApiProvider): Promise<void> {
  await SecureStore.deleteItemAsync(PROVIDER_STORAGE_KEY[provider]);
}

export async function getActiveProvider(): Promise<ApiProvider> {
  const stored = await SecureStore.getItemAsync(ACTIVE_PROVIDER_STORAGE_KEY);
  return stored === 'gemini' ? 'gemini' : 'deepseek';
}

export async function setActiveProvider(provider: ApiProvider): Promise<void> {
  await SecureStore.setItemAsync(ACTIVE_PROVIDER_STORAGE_KEY, provider);
}
