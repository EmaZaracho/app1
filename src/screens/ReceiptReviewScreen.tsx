import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { addMovements, getFundsWithBalances } from '../db/database';
import { useDb } from '../db/useDb';
import { computeFundSelection } from '../domain/movementRules';
import { FundSelector, type SelectableFund } from '../components/FundSelector';
import { ReceiptItemRow, type EditableReceiptItem } from '../components/ReceiptItemRow';
import { formatCurrency } from '../utils/format';
import { useTheme, type Theme } from '../theme';
import type { ExpenseCategory, NewMovement, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ReceiptReview'>;

let nextItemId = 0;
function makeItemId(): string {
  nextItemId += 1;
  return `item-${nextItemId}`;
}

/** Suma vs. total de la IA a más de un 2% de diferencia: advertencia no bloqueante. */
const TOTAL_MISMATCH_THRESHOLD = 0.02;

export default function ReceiptReviewScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const { receipt } = route.params;

  const [merchantName, setMerchantName] = useState(receipt.merchantName ?? '');
  const [items, setItems] = useState<EditableReceiptItem[]>(() =>
    receipt.items.map((item) => ({
      id: makeItemId(),
      description: item.description,
      amountText: String(item.amount),
      category: item.category,
    }))
  );
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [funds, setFunds] = useState<SelectableFund[]>([]);
  const [defaultFundId, setDefaultFundId] = useState<number | null>(null);
  const [activeFundOptions, setActiveFundOptions] = useState<{ id: number; isDefault: boolean }[]>([]);
  const [selectedFundId, setSelectedFundId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const activeFunds = await getFundsWithBalances(db, false);
        if (cancelled) return;
        const options = activeFunds.map((f) => ({ id: f.id, isDefault: f.isDefault }));
        const defId = activeFunds.find((f) => f.isDefault)?.id ?? null;
        setFunds(activeFunds.map((f) => ({ id: f.id, name: f.name, icon: f.icon, color: f.color })));
        setActiveFundOptions(options);
        setDefaultFundId(defId);
        setSelectedFundId((prev) => {
          if (prev != null) return prev;
          const selection = computeFundSelection({
            type: 'gasto',
            resolvedSourceId: null,
            resolvedDestId: null,
            activeFunds: options,
            defaultFundId: defId,
          });
          return selection.sourceFundId;
        });
      })();
      return () => {
        cancelled = true;
      };
    }, [db])
  );

  function updateItem(id: string, patch: Partial<EditableReceiptItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    if (expandedItemId === id) setExpandedItemId(null);
  }

  const parsedAmounts = items.map((it) => Number(it.amountText.replace(',', '.')));
  const hasInvalidAmount = parsedAmounts.some((n) => !Number.isFinite(n) || n <= 0);
  const sumAmount = parsedAmounts.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);

  const totalMismatchWarning = useMemo(() => {
    if (receipt.totalAmount == null || receipt.totalAmount <= 0 || hasInvalidAmount) return null;
    const diff = Math.abs(sumAmount - receipt.totalAmount) / receipt.totalAmount;
    if (diff <= TOTAL_MISMATCH_THRESHOLD) return null;
    return `La suma (${formatCurrency(sumAmount)}) no coincide con el total del ticket (${formatCurrency(
      receipt.totalAmount
    )}). Revisá los montos.`;
  }, [sumAmount, receipt.totalAmount, hasInvalidAmount]);

  const fundSelection = useMemo(
    () =>
      computeFundSelection({
        type: 'gasto',
        resolvedSourceId: selectedFundId,
        resolvedDestId: null,
        activeFunds: activeFundOptions,
        defaultFundId,
      }),
    [selectedFundId, activeFundOptions, defaultFundId]
  );

  const canConfirm = items.length > 0 && !hasInvalidAmount && fundSelection.canConfirm && !saving;

  async function handleConfirm() {
    if (!canConfirm || selectedFundId == null) return;
    setSaving(true);
    setError(null);
    try {
      const movements: NewMovement[] = items.map((item) => {
        const amount = Number(item.amountText.replace(',', '.'));
        const description = item.description.trim() || 'Ítem de factura';
        const merchantPrefix = merchantName.trim() ? `${merchantName.trim()} - ` : '';
        return {
          type: 'gasto',
          amount,
          category: item.category as ExpenseCategory,
          description,
          rawText: `[factura] ${merchantPrefix}${description}`,
          sourceFundId: selectedFundId,
          destinationFundId: null,
        };
      });
      await addMovements(db, movements);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los movimientos.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (items.length === 0) {
      navigation.goBack();
      return;
    }
    Alert.alert('Descartar factura', '¿Descartar los ítems detectados sin guardarlos?', [
      { text: 'Seguir editando', style: 'cancel' },
      { text: 'Descartar', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Comercio (opcional)</Text>
        <TextInput
          style={styles.merchantInput}
          value={merchantName}
          onChangeText={setMerchantName}
          placeholder="Nombre del comercio"
          placeholderTextColor={theme.textMuted}
        />

        <Text style={styles.label}>Ítems ({items.length})</Text>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>No quedan ítems. Volvé atrás para escanear otra foto.</Text>
        ) : (
          items.map((item) => (
            <ReceiptItemRow
              key={item.id}
              item={item}
              expanded={expandedItemId === item.id}
              onToggleExpanded={() => setExpandedItemId((prev) => (prev === item.id ? null : item.id))}
              onChangeDescription={(v) => updateItem(item.id, { description: v })}
              onChangeAmount={(v) => updateItem(item.id, { amountText: v })}
              onChangeCategory={(c) => updateItem(item.id, { category: c })}
              onRemove={() => removeItem(item.id)}
            />
          ))
        )}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatCurrency(sumAmount)}</Text>
        </View>
        {totalMismatchWarning ? <Text style={styles.warningText}>⚠️ {totalMismatchWarning}</Text> : null}

        <FundSelector
          label="¿Desde qué fondo se pagó?"
          funds={funds}
          selectedId={selectedFundId}
          onSelect={setSelectedFundId}
          required
        />
        {fundSelection.blockingMessage ? (
          <Text style={styles.warningText}>{fundSelection.blockingMessage}</Text>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.actionsRow}>
          <Pressable style={styles.cancelButton} onPress={handleCancel} disabled={saving}>
            <Text style={styles.cancelText}>Descartar</Text>
          </Pressable>
          <Pressable
            style={[styles.confirmButton, !canConfirm && styles.buttonDisabled]}
            onPress={handleConfirm}
            disabled={!canConfirm}
          >
            {saving ? (
              <ActivityIndicator color={theme.primaryText} />
            ) : (
              <Text style={styles.confirmText}>Confirmar {items.length} gasto{items.length === 1 ? '' : 's'}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    container: { padding: 20, paddingBottom: 48 },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16, color: theme.text },
    merchantInput: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
    },
    emptyText: { color: theme.textMuted, fontSize: 13, marginTop: 8 },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 8,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    totalLabel: { fontSize: 14, color: theme.textSecondary, fontWeight: '600' },
    totalValue: { fontSize: 20, color: theme.text, fontWeight: '800' },
    warningText: { color: theme.warningText, fontSize: 12, marginTop: 8 },
    errorText: { color: theme.danger, fontSize: 13, marginTop: 16 },
    actionsRow: { flexDirection: 'row', gap: 8, marginTop: 24 },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      alignItems: 'center',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cancelText: { color: theme.textSecondary, fontWeight: '600' },
    confirmButton: {
      flex: 2,
      paddingVertical: 14,
      alignItems: 'center',
      borderRadius: 10,
      backgroundColor: theme.primary,
    },
    buttonDisabled: { opacity: 0.5 },
    confirmText: { color: theme.primaryText, fontWeight: '700', fontSize: 15 },
  });
}
