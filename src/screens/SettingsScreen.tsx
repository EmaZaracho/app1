import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Application from 'expo-application';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  clearApiKey,
  getApiKey,
  getSelectedProvider,
  setApiKey,
  setSelectedProvider,
} from '../services/apiKey';
import { formatVersionInfo } from '../services/appVersion';
import { useTheme, type Theme } from '../theme';
import { AI_PROVIDERS, type AIProvider, type MainTabParamList, type RootStackParamList } from '../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'SettingsTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function SettingsScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [provider, setProvider] = useState<AIProvider>('deepseek');
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getSelectedProvider().then(setProvider);
  }, []);

  useEffect(() => {
    getApiKey(provider).then((stored) => setKey(stored ?? ''));
  }, [provider]);

  const providerInfo = AI_PROVIDERS.find((p) => p.id === provider)!;
  const versionInfo = useMemo(
    () => formatVersionInfo(Application.nativeApplicationVersion, Application.nativeBuildVersion),
    []
  );

  async function handleSelectProvider(next: AIProvider) {
    setProvider(next);
    await setSelectedProvider(next);
  }

  async function handleSave() {
    if (!key.trim()) {
      Alert.alert('Falta la API key', `Pegá tu API key de ${providerInfo.label} antes de guardar.`);
      return;
    }
    await setApiKey(provider, key.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleClear() {
    if (!key) return;
    Alert.alert(
      'Borrar API key',
      'Sin la API key no vas a poder agregar nuevos movimientos con este proveedor hasta que cargues otra. ¿Querés borrarla?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            await clearApiKey(provider);
            setKey('');
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.fundsButton} onPress={() => navigation.navigate('Funds')}>
        <Text style={styles.fundsButtonText}>💵 Administrar fondos</Text>
        <Text style={styles.fundsButtonChevron}>›</Text>
      </Pressable>

      <Pressable style={styles.fundsButton} onPress={() => navigation.navigate('CategoryPrioritySettings')}>
        <Text style={styles.fundsButtonText}>🏷️ Prioridad de categorías</Text>
        <Text style={styles.fundsButtonChevron}>›</Text>
      </Pressable>

      <Text style={styles.label}>Proveedor de IA</Text>
      <View style={styles.providerRow}>
        {AI_PROVIDERS.map((p) => (
          <Pressable
            key={p.id}
            style={[styles.providerChip, provider === p.id && styles.providerChipSelected]}
            onPress={() => handleSelectProvider(p.id)}
          >
            <Text
              style={[
                styles.providerChipText,
                provider === p.id && styles.providerChipTextSelected,
              ]}
            >
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.label, styles.keyLabel]}>API key de {providerInfo.label}</Text>
      <TextInput
        style={styles.input}
        value={key}
        onChangeText={setKey}
        placeholder="sk-..."
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <Text style={styles.hint}>
        Se guarda cifrada en este dispositivo y solo se usa para conectar con la API de{' '}
        {providerInfo.label} al registrar un movimiento. Conseguí la tuya en{' '}
        <Text style={styles.link} onPress={() => Linking.openURL(providerInfo.keyUrl)}>
          {providerInfo.keyUrl.replace('https://', '')}
        </Text>
        .
      </Text>

      <Pressable style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>{saved ? 'Guardado ✓' : 'Guardar'}</Text>
      </Pressable>

      <Pressable style={styles.clearButton} onPress={handleClear}>
        <Text style={styles.clearButtonText}>Borrar API key de {providerInfo.label}</Text>
      </Pressable>

      <View style={styles.versionBlock}>
        <Text style={styles.versionText}>GestorIA {versionInfo.version}</Text>
        <Text style={styles.versionText}>Compilación {versionInfo.build}</Text>
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, padding: 20, backgroundColor: theme.bg },
    fundsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 24,
    },
    fundsButtonText: { fontSize: 15, fontWeight: '600', color: theme.text },
    fundsButtonChevron: { fontSize: 22, color: theme.textMuted },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 8, color: theme.text },
    keyLabel: { marginTop: 24 },
    providerRow: { flexDirection: 'row', gap: 8 },
    providerChip: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    providerChipSelected: { backgroundColor: theme.chipSelectedBg, borderColor: theme.chipSelectedBg },
    providerChipText: { fontSize: 14, color: theme.text, fontWeight: '600' },
    providerChipTextSelected: { color: theme.chipSelectedText },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
    },
    hint: { fontSize: 13, color: theme.textSecondary, marginTop: 10, lineHeight: 18 },
    link: { color: theme.primary },
    saveButton: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 24,
    },
    saveButtonText: { color: theme.primaryText, fontWeight: '700', fontSize: 16 },
    clearButton: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
    clearButtonText: { color: theme.danger, fontWeight: '600' },
    versionBlock: { alignItems: 'center', marginTop: 32 },
    versionText: { fontSize: 12, color: theme.textMuted },
  });
}
