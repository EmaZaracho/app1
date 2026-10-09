import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FormScrollView } from '../components/FormScrollView';
import { useDb } from '../db/useDb';
import {
  addMovementToPurchase,
  detachMovementFromPurchase,
  getPurchase,
  getPurchaseMovements,
  updatePurchaseMerchant,
} from '../db/movementsRepo';
import { formatCurrency } from '../utils/format';
import { colorForCategory, iconForCategory } from '../categoryVisuals';
import { useTheme, type Theme } from '../theme';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type Movement, type RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'PurchaseDetail'>;

export default function PurchaseDetailScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const { purchaseId } = route.params;

  const [merchant, setMerchant] = useState('');
  const [savedMerchant, setSavedMerchant] = useState('');
  const [items, setItems] = useState<Movement[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState<ExpenseCategory>('Otros');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [purchase, movements] = await Promise.all([
      getPurchase(db, purchaseId),
      getPurchaseMovements(db, purchaseId),
    ]);
    setMerchant(purchase?.merchant ?? '');
    setSavedMerchant(purchase?.merchant ?? '');
    setItems(movements);
    setLoaded(true);
  }, [db, purchaseId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  async function handleSaveMerchant() {
    if (merchant.trim() === savedMerchant.trim()) return;
    await updatePurchaseMerchant(db, purchaseId, merchant);
    await load();
  }

  async function handleDetach(item: Movement) {
    await detachMovementFromPurchase(db, item.id);
    await load();
  }

  async function handleAddItem() {
    const amount = Number(newAmount.replace(',', '.'));
    if (!newDescription.trim()) return setError('Ingresá una descripción.');
    if (!Number.isFinite(amount) || amount <= 0) return setError('Ingresá un monto válido mayor a 0.');
    try {
      await addMovementToPurchase(db, purchaseId, {
        amount,
        category: newCategory,
        description: newDescription.trim(),
      });
    } catch (err) {
      return setError(err instanceof Error ? err.message : 'No se pudo agregar el ítem.');
    }
    setError(null);
    setNewDescription('');
    setNewAmount('');
    await load();
  }

  if (!loaded) return <View style={styles.container} />;

  return (
    <FormScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Comercio</Text>
      <TextInput
        style={styles.input}
        value={merchant}
        placeholder="Sin nombre"
        placeholderTextColor={theme.textMuted}
        onChangeText={setMerchant}
        onEndEditing={handleSaveMerchant}
      />

      <View style={styles.totalRow}>
        <Text style={styles.totalLabel}>
          {items.length} {items.length === 1 ? 'ítem' : 'ítems'}
        </Text>
        <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
      </View>

      {items.map((item) => (
        <View key={item.id} style={styles.itemRow}>
          <Pressable
            style={styles.itemMain}
            accessibilityRole="button"
            onPress={() => navigation.navigate('MovementDetail', { movementId: item.id })}
          >
            <Text style={styles.itemDescription} numberOfLines={2}>
              {iconForCategory(item.category ?? 'Otros')} {item.description}
            </Text>
            <View style={styles.itemMeta}>
              {item.category ? (
                <View style={[styles.dot, { backgroundColor: colorForCategory(item.category, theme.scheme) }]} />
              ) : null}
              <Text style={styles.itemCategory}>{item.category}</Text>
            </View>
          </Pressable>
          <Text style={styles.itemAmount}>{formatCurrency(item.amount)}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Quitar ${item.description} de la compra`}
            style={styles.detachButton}
            onPress={() => handleDetach(item)}
          >
            <Text style={styles.detachText}>Quitar</Text>
          </Pressable>
        </View>
      ))}
      {items.length > 0 ? (
        <Text style={styles.hint}>
          “Quitar” deja el ítem como gasto suelto: no se borra ni cambia su monto.
        </Text>
      ) : null}

      <Text style={[styles.label, styles.sectionLabel]}>Agregar ítem</Text>
      <TextInput
        style={styles.input}
        value={newDescription}
        placeholder="Descripción"
        placeholderTextColor={theme.textMuted}
        onChangeText={setNewDescription}
      />
      <TextInput
        style={[styles.input, styles.amountInput]}
        value={newAmount}
        placeholder="Monto"
        placeholderTextColor={theme.textMuted}
        keyboardType="decimal-pad"
        onChangeText={setNewAmount}
      />
      <View style={styles.categoryRow}>
        {EXPENSE_CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            accessibilityRole="button"
            accessibilityState={{ selected: cat === newCategory }}
            style={[styles.categoryChip, cat === newCategory && styles.categoryChipSelected]}
            onPress={() => setNewCategory(cat)}
          >
            <Text style={[styles.categoryChipText, cat === newCategory && styles.categoryChipTextSelected]}>
              {iconForCategory(cat)} {cat}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable style={styles.addButton} onPress={handleAddItem}>
        <Text style={styles.addButtonText}>Agregar a la compra</Text>
      </Pressable>
    </FormScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    content: { padding: 16, paddingBottom: 32 },
    label: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 },
    sectionLabel: { marginTop: 24 },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 15,
      marginBottom: 10,
    },
    amountInput: { width: 160 },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginVertical: 12,
    },
    totalLabel: { fontSize: 14, color: theme.textSecondary },
    totalValue: { fontSize: 17, fontWeight: '700', color: theme.danger },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    itemMain: { flex: 1, minHeight: 44, justifyContent: 'center' },
    itemDescription: { fontSize: 15, color: theme.text },
    itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    dot: { width: 7, height: 7, borderRadius: 4 },
    itemCategory: { fontSize: 12, color: theme.textSecondary },
    itemAmount: { fontSize: 15, fontWeight: '600', color: theme.text, flexShrink: 0 },
    detachButton: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    detachText: { fontSize: 12, color: theme.textSecondary },
    hint: { fontSize: 12, color: theme.textMuted, marginTop: 8 },
    categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    categoryChip: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    categoryChipSelected: { backgroundColor: theme.chipSelectedBg, borderColor: theme.primary },
    categoryChipText: { fontSize: 13, color: theme.text },
    categoryChipTextSelected: { color: theme.chipSelectedText, fontWeight: '600' },
    error: { color: theme.danger, fontSize: 13, marginBottom: 8 },
    addButton: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    addButtonText: { color: theme.primaryText, fontWeight: '700', fontSize: 15 },
  });
}
