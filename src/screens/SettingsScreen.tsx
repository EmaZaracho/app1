import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  clearApiKey,
  getActiveProvider,
  getApiKey,
  setActiveProvider,
  setApiKey,
} from '../services/apiKey';
import { API_PROVIDERS, PROVIDER_LABELS, type ApiProvider } from '../types';

const PROVIDER_INFO: Record<ApiProvider, { placeholder: string; hintUrl: string; hintLabel: string }> = {
  deepseek: {
    placeholder: 'sk-...',
    hintUrl: 'https://platform.deepseek.com',
    hintLabel: 'platform.deepseek.com',
  },
  gemini: {
    placeholder: 'AIza...',
    hintUrl: 'https://aistudio.google.com/apikey',
    hintLabel: 'aistudio.google.com/apikey',
  },
};

export default function SettingsScreen() {
  const [activeProvider, setActiveProviderState] = useState<ApiProvider>('deepseek');
  const [keys, setKeys] = useState<Record<ApiProvider, string>>({ deepseek: '', gemini: '' });
  const [savedProvider, setSavedProvider] = useState<ApiProvider | null>(null);

  useEffect(() => {
    (async () => {
      const [provider, deepseekKey, geminiKey] = await Promise.all([
        getActiveProvider(),
        getApiKey('deepseek'),
        getApiKey('gemini'),
      ]);
      setActiveProviderState(provider);
      setKeys({ deepseek: deepseekKey ?? '', gemini: geminiKey ?? '' });
    })();
  }, []);

  async function handleSelectProvider(provider: ApiProvider) {
    setActiveProviderState(provider);
    await setActiveProvider(provider);
  }

  async function handleSave(provider: ApiProvider) {
    const value = keys[provider].trim();
    if (!value) {
      Alert.alert('Falta la API key', `Pegá tu API key de ${PROVIDER_LABELS[provider]} antes de guardar.`);
      return;
    }
    await setApiKey(provider, value);
    setSavedProvider(provider);
    setTimeout(() => setSavedProvider((current) => (current === provider ? null : current)), 2000);
  }

  function handleClear(provider: ApiProvider) {
    if (!keys[provider]) return;
    Alert.alert(
      `Borrar API key de ${PROVIDER_LABELS[provider]}`,
      `Si ${PROVIDER_LABELS[provider]} es tu proveedor activo, no vas a poder agregar nuevos movimientos hasta que cargues otra. ¿Querés borrarla?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            await clearApiKey(provider);
            setKeys((prev) => ({ ...prev, [provider]: '' }));
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Proveedor activo</Text>
      <Text style={styles.sectionHint}>
        Se usa para interpretar el texto que escribís al agregar un movimiento.
      </Text>
      <View style={styles.providerRow}>
        {API_PROVIDERS.map((provider) => (
          <Pressable
            key={provider}
            style={[styles.providerChip, activeProvider === provider && styles.providerChipSelected]}
            onPress={() => handleSelectProvider(provider)}
          >
            <Text
              style={[
                styles.providerChipText,
                activeProvider === provider && styles.providerChipTextSelected,
              ]}
            >
              {PROVIDER_LABELS[provider]}
            </Text>
          </Pressable>
        ))}
      </View>

      {API_PROVIDERS.map((provider) => (
        <View key={provider} style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.label}>API key de {PROVIDER_LABELS[provider]}</Text>
            {activeProvider === provider ? (
              <Text style={styles.activeBadge}>Activo</Text>
            ) : null}
          </View>
          <TextInput
            style={styles.input}
            value={keys[provider]}
            onChangeText={(value) => setKeys((prev) => ({ ...prev, [provider]: value }))}
            placeholder={PROVIDER_INFO[provider].placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Text style={styles.hint}>
            Se guarda cifrada en este dispositivo y solo se usa para conectar con la API de{' '}
            {PROVIDER_LABELS[provider]} al registrar un movimiento. Conseguí la tuya en{' '}
            <Text
              style={styles.link}
              onPress={() => Linking.openURL(PROVIDER_INFO[provider].hintUrl)}
            >
              {PROVIDER_INFO[provider].hintLabel}
            </Text>
            .
          </Text>

          <Pressable style={styles.saveButton} onPress={() => handleSave(provider)}>
            <Text style={styles.saveButtonText}>
              {savedProvider === provider ? 'Guardado ✓' : 'Guardar'}
            </Text>
          </Pressable>

          <Pressable style={styles.clearButton} onPress={() => handleClear(provider)}>
            <Text style={styles.clearButtonText}>Borrar API key</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '600' },
  sectionHint: { fontSize: 13, color: '#666', marginTop: 4 },
  providerRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 24 },
  providerChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  providerChipSelected: { backgroundColor: '#111827', borderColor: '#111827' },
  providerChipText: { fontSize: 14, color: '#333', fontWeight: '600' },
  providerChipTextSelected: { color: '#fff' },
  card: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
    paddingTop: 20,
    marginTop: 20,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '600' },
  activeBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  hint: { fontSize: 13, color: '#666', marginTop: 10, lineHeight: 18 },
  link: { color: '#2563eb' },
  saveButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  clearButton: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  clearButtonText: { color: '#dc2626', fontWeight: '600' },
});
