import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { clearApiKey, getApiKey, setApiKey } from '../services/apiKey';

export default function SettingsScreen() {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getApiKey().then((stored) => {
      if (stored) setKey(stored);
    });
  }, []);

  async function handleSave() {
    if (!key.trim()) {
      Alert.alert('Falta la API key', 'Pegá tu API key de DeepSeek antes de guardar.');
      return;
    }
    await setApiKey(key.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleClear() {
    if (!key) return;
    Alert.alert(
      'Borrar API key',
      'Sin la API key no vas a poder agregar nuevos gastos hasta que cargues otra. ¿Querés borrarla?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            await clearApiKey();
            setKey('');
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>API key de DeepSeek</Text>
      <TextInput
        style={styles.input}
        value={key}
        onChangeText={setKey}
        placeholder="sk-..."
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <Text style={styles.hint}>
        Se guarda cifrada en este dispositivo y solo se usa para conectar con la API de DeepSeek
        al registrar un gasto. Conseguí la tuya en{' '}
        <Text style={styles.link} onPress={() => Linking.openURL('https://platform.deepseek.com')}>
          platform.deepseek.com
        </Text>
        .
      </Text>

      <Pressable style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>{saved ? 'Guardado ✓' : 'Guardar'}</Text>
      </Pressable>

      <Pressable style={styles.clearButton} onPress={handleClear}>
        <Text style={styles.clearButtonText}>Borrar API key</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
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
    marginTop: 24,
  },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  clearButton: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  clearButtonText: { color: '#dc2626', fontWeight: '600' },
});
