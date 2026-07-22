import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useDb } from '../db/useDb';
import { getOccurrenceById } from '../db/recurringExpenseOccurrencesRepository';
import { getRuleById } from '../db/recurringExpenseRulesRepository';
import { getFundsWithBalances } from '../db/fundsRepo';
import { registerOccurrencePayment } from '../recurring/recurringPayment';
import { assertFundsStillActive } from '../domain/movementRules';
import { useMovementForm } from '../hooks/useMovementForm';
import { useKeyboardAwareScroll } from '../hooks/useKeyboardAwareScroll';
import { MovementFormFields } from '../components/MovementFormFields';
import type { SelectableFund } from '../components/FundSelector';
import { useTheme, type Theme } from '../theme';
import type { ExpenseCategory, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterOccurrencePayment'>;

export default function RegisterOccurrencePaymentScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const { occurrenceId } = route.params;

  const [loaded, setLoaded] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [initialAmountText, setInitialAmountText] = useState('');
  const [initialCategory, setInitialCategory] = useState<ExpenseCategory>('Otros');
  const [initialDescription, setInitialDescription] = useState('');
  const [initialFundId, setInitialFundId] = useState<number | null>(null);
  const [funds, setFunds] = useState<SelectableFund[]>([]);
  const [activeFundOptions, setActiveFundOptions] = useState<{ id: number; isDefault: boolean }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    (async () => {
      const occ = await getOccurrenceById(db, occurrenceId);
      if (!occ) return;
      const rule = await getRuleById(db, occ.ruleId);
      const active = await getFundsWithBalances(db, false);
      if (!mountedRef.current) return;
      setFunds(active.map((f) => ({ id: f.id, name: f.name, icon: f.icon, color: f.color })));
      setActiveFundOptions(active.map((f) => ({ id: f.id, isDefault: f.isDefault })));
      setRuleName(rule?.name ?? 'Gasto recurrente');
      setInitialDescription(rule?.name ?? 'Gasto recurrente');
      setInitialCategory(occ.category);
      setInitialAmountText(occ.projectedAmount != null ? String(occ.projectedAmount) : '');
      setInitialFundId(occ.fundAssignmentMode === 'fixed' ? occ.fundId : null);
      setLoaded(true);
    })();
  }, [db, occurrenceId]);

  // Tipo fijo 'gasto': un pago de ocurrencia recurrente nunca puede convertirse
  // en ingreso o transferencia. Nunca se pasa `defaultFundId`: con fondo fijo
  // ya viene precompletado, y con ask_on_payment se debe elegir explícitamente.
  const form = useMovementForm({
    lockedType: 'gasto',
    initialAmountText,
    initialCategory,
    initialDescription,
    initialSourceFundId: initialFundId,
    activeFunds: activeFundOptions,
  });
  const kb = useKeyboardAwareScroll();

  const handleConfirm = useCallback(async () => {
    if (saving || !form.canSubmit) return;
    const result = form.buildResult(`[recurrente] ${form.description.trim()}`);
    if (!result.movement) {
      setError(result.error);
      return;
    }
    const activeIds = new Set(activeFundOptions.map((f) => f.id));
    const fundError = assertFundsStillActive([result.movement.sourceFundId], activeIds);
    if (fundError) {
      setError(fundError);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await registerOccurrencePayment(db, {
        occurrenceId,
        amount: result.movement.amount,
        category: result.movement.category as ExpenseCategory,
        description: result.movement.description,
        fundId: result.movement.sourceFundId!,
      });
      if (!mountedRef.current) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago.');
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [saving, form, activeFundOptions, db, occurrenceId, navigation]);

  if (!loaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={kb.scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        onScroll={kb.onScroll}
        scrollEventThrottle={kb.scrollEventThrottle}
      >
        <Text style={styles.title}>Registrar pago de {ruleName}</Text>

        <MovementFormFields form={form} funds={funds} onInputFocus={kb.registerFocusedInput} />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          style={[styles.confirmButton, (saving || !form.canSubmit) && styles.disabled]}
          onPress={handleConfirm}
          disabled={saving || !form.canSubmit}
        >
          {saving ? (
            <ActivityIndicator color={theme.primaryText} />
          ) : (
            <Text style={styles.confirmText}>Registrar gasto</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
    container: { padding: 20, paddingBottom: 48 },
    title: { fontSize: 18, fontWeight: '800', color: theme.text },
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
