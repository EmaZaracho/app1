import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { deleteMovement, getMovementById, updateMovement } from '../db/database';
import {
  categoriesForType,
  type Category,
  type Movement,
  type MovementType,
  type RootStackParamList,
} from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'MovementDetail'>;

export default function MovementDetailScreen({ route, navigation }: Props) {
  const { movementId } = route.params;
  const db = useSQLiteContext();
  const [movement, setMovement] = useState<Movement | null>(null);
  const [type, setType] = useState<MovementType>('gasto');
  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState<Category>('Otros');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leavingRef = useRef(false);

  useEffect(() => {
    getMovementById(db, movementId).then((found) => {
      if (!found) return;
      setMovement(found);
      setType(found.type);
      setAmountText(String(found.amount));
      setCategory(found.category);
      setDescription(found.description);
    });
  }, [db, movementId]);

  const dirty =
    !!movement &&
    (type !== movement.type ||
      amountText !== String(movement.amount) ||
      category !== movement.category ||
      description !== movement.description);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (leavingRef.current || !dirty) return;
      e.preventDefault();
      Alert.alert(
        'Descartar cambios',
        'Tenés cambios sin guardar en este movimiento. ¿Querés descartarlos?',
        [
          { text: 'Seguir editando', style: 'cancel' },
          {
            text: 'Descartar',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ]
      );
    });
  }, [navigation, dirty]);

  function handleSelectType(nextType: MovementType) {
    setType(nextType);
    if (!categoriesForType(nextType).includes(category)) {
      setCategory('Otros');
    }
  }

  async function handleSave() {
    const amount = Number(amountText.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Ingresá un monto válido mayor a 0.');
      return;
    }
    if (!description.trim()) {
      setError('Ingresá una descripción.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await updateMovement(db, movementId, { type, amount, category, description: description.trim() });
      leavingRef.current = true;
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert('Eliminar movimiento', '¿Seguro que querés eliminarlo?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await deleteMovement(db, movementId);
          leavingRef.current = true;
          navigation.navigate('Home', { deletedMovement: movement ?? undefined });
        },
      },
    ]);
  }

  if (!movement) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.label}>Tipo</Text>
      <View style={styles.typeRow}>
        {(['gasto', 'ingreso'] as const).map((t) => (
          <Pressable
            key={t}
            style={[styles.typeChip, type === t && styles.typeChipSelected]}
            onPress={() => handleSelectType(t)}
          >
            <Text style={[styles.typeChipText, type === t && styles.typeChipTextSelected]}>
              {t === 'gasto' ? 'Gasto' : 'Ingreso'}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Monto</Text>
      <TextInput
        style={styles.input}
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="decimal-pad"
      />

      <Text style={styles.label}>Categoría</Text>
      <View style={styles.categoryRow}>
        {categoriesForType(type).map((cat) => (
          <Pressable
            key={cat}
            style={[styles.categoryChip, cat === category && styles.categoryChipSelected]}
            onPress={() => setCategory(cat)}
          >
            <Text style={[styles.categoryChipText, cat === category && styles.categoryChipTextSelected]}>
              {cat}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Descripción</Text>
      <TextInput style={styles.input} value={description} onChangeText={setDescription} />

      <Text style={styles.rawTextHint}>Texto original: "{movement.rawText}"</Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        style={[styles.saveButton, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Guardar cambios</Text>}
      </Pressable>

      <Pressable style={styles.deleteButton} onPress={handleDelete} disabled={saving}>
        <Text style={styles.deleteButtonText}>Eliminar movimiento</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
  },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  typeChipSelected: { backgroundColor: '#111827', borderColor: '#111827' },
  typeChipText: { fontSize: 14, color: '#333', fontWeight: '600' },
  typeChipTextSelected: { color: '#fff' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  categoryChipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  categoryChipText: { fontSize: 13, color: '#333' },
  categoryChipTextSelected: { color: '#fff', fontWeight: '600' },
  rawTextHint: { fontSize: 12, color: '#999', marginTop: 16, fontStyle: 'italic' },
  errorText: { color: '#dc2626', marginTop: 16 },
  saveButton: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  deleteButton: { paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  deleteButtonText: { color: '#dc2626', fontWeight: '600' },
});
