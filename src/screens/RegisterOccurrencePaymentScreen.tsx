import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useDb } from '../db/useDb';
import { getOccurrenceById } from '../db/recurringExpenseOccurrencesRepository';
import { getRuleById } from '../db/recurringExpenseRulesRepository';
import { getFundsWithBalances } from '../db/fundsRepo';
import { registerOccurrencePayment } from '../recurring/recurringPayment';
import { FundSelector, type SelectableFund } from '../components/FundSelector';
import { CATEGORY_ICON } from '../categoryVisuals';
import { useTheme, type Theme } from '../theme';
import { EXPENSE_CATEGORIES, type ExpenseCategory, type RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterOccurrencePayment'>;

export default function RegisterOccurrencePaymentScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const { occurrenceId } = route.params;

  const [loaded, setLoaded] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Otros');
  const [description, setDescription] = useState('');
  const [funds, setFunds] = useState<SelectableFund[]>([]);
  const [fundId, setFundId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const occ = await getOccurrenceById(db, occurrenceId);
      if (!occ) return;
      const rule = await getRuleById(db, occ.ruleId);
      const active = await getFundsWithBalances(db, false);
      setFunds(active.map((f) => ({ id: f.id, name: f.name, icon: f.icon, color: f.color })));
      setRuleName(rule?.name ?? 'Gasto recurrente');
      setDescription(rule?.name ?? 'Gasto recurrente');
      setCategory(occ.category);
      setAmountText(occ.projectedAmount != null ? String(occ.projectedAmount) : '');
      setFundId(occ.fundAssignmentMode === 'fixed' ? occ.fundId : null);
      setLoaded(true);
    })();
  }, [db, occurrenceId]);

  async function handleConfirm() {
    const amount = Number(amountText.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Ingresá un monto válido mayor a 0.');
      return;
    }
    if (fundId == null) {
      setError('Elegí el fondo desde el que se pagó.');
      return;
    }
    if (!description.trim()) {
      setError('Ingresá una descripción.');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await registerOccurrencePayment(db, {
        occurrenceId,
        amount,
        category,
        description: description.trim(),
        fundId,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago.');
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Registrar pago de {ruleName}</Text>

      <Text style={styles.label}>Monto real</Text>
      <TextInput
        style={styles.input}
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="decimal-pad"
        placeholder="Monto pagado"
        placeholderTextColor={theme.textMuted}
      />

      <Text style={styles.label}>Categoría</Text>
      <View style={styles.chipsWrap}>
        {EXPENSE_CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            style={[styles.chip, category === cat && styles.chipSelected]}
            onPress={() => setCategory(cat)}
          >
            <Text style={[styles.chipText, category === cat && styles.chipTextSelected]}>
              {CATEGORY_ICON[cat]} {cat}
            </Text>
          </Pressable>
        ))}
      </View>

      <FundSelector label="¿Desde qué fondo se pagó?" funds={funds} selectedId={fundId} onSelect={setFundId} required />

      <Text style={styles.label}>Descripción</Text>
      <TextInput style={styles.input} value={description} onChangeText={setDescription} />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable style={[styles.confirmButton, saving && styles.disabled]} onPress={handleConfirm} disabled={saving}>
        {saving ? (
          <ActivityIndicator color={theme.primaryText} />
        ) : (
          <Text style={styles.confirmText}>Registrar gasto</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
    container: { padding: 20, paddingBottom: 48 },
    title: { fontSize: 18, fontWeight: '800', color: theme.text },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16, color: theme.text },
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
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { borderWidth: 1, borderColor: theme.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
    chipSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
    chipText: { fontSize: 13, color: theme.text },
    chipTextSelected: { color: theme.primaryText, fontWeight: '600' },
    errorText: { color: theme.danger, marginTop: 16 },
    confirmButton: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 24,
    },
    disabled: { opacity: 0.6 },
    confirmText: { color: theme.primaryText, fontWeight: '700', fontSize: 16 },
  });
}
