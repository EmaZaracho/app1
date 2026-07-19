import * as SecureStore from 'expo-secure-store';
import type { AIProvider } from '../types';

const SELECTED_PROVIDER_KEY = 'selected_ai_provider';
const DEFAULT_PROVIDER: AIProvider = 'deepseek';

function storageKeyFor(provider: AIProvider): string {
  return `${provider}_api_key`;
}

export async function getSelectedProvider(): Promise<AIProvider> {
  const stored = await SecureStore.getItemAsync(SELECTED_PROVIDER_KEY);
  return stored === 'gemini' ? 'gemini' : DEFAULT_PROVIDER;
}

export async function setSelectedProvider(provider: AIProvider): Promise<void> {
  await SecureStore.setItemAsync(SELECTED_PROVIDER_KEY, provider);
}

export async function getApiKey(provider: AIProvider): Promise<string | null> {
  return SecureStore.getItemAsync(storageKeyFor(provider));
}

export async function setApiKey(provider: AIProvider, value: string): Promise<void> {
  await SecureStore.setItemAsync(storageKeyFor(provider), value.trim());
}

export async function clearApiKey(provider: AIProvider): Promise<void> {
  await SecureStore.deleteItemAsync(storageKeyFor(provider));
}
