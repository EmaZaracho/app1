import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useDb } from '../db/useDb';
import type { SqlDatabase } from '../db/sqlDatabase';
import { getOccurrenceById } from '../db/recurringExpenseOccurrencesRepository';
import { getRuleById } from '../db/recurringExpenseRulesRepository';
import { getFundsWithBalances } from '../db/fundsRepo';
import { registerOccurrencePayment } from '../recurring/recurringPayment';
import { assertFundsStillActive } from '../domain/movementRules';
import { useMovementForm } from '../hooks/useMovementForm';
import { MovementFormFields } from '../components/MovementFormFields';
import type { SelectableFund } from '../components/FundSelector';
import { useTheme, type Theme } from '../theme';
import type { ExpenseCategory, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RegisterOccurrencePayment'>;

interface PaymentFormData {
  ruleName: string;
  amountText: string;
  category: ExpenseCategory;
  description: string;
  fundId: number | null;
  funds: SelectableFund[];
  activeFundOptions: { id: number; isDefault: boolean }[];
}

export default function RegisterOccurrencePaymentScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const { occurrenceId } = route.params;
  const [formData, setFormData] = useState<PaymentFormData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let activeRequest = true;
    setLoading(true);
    setLoadError(null);
    setFormData(null);

    void (async () => {
      try {
        const occurrence = await getOccurrenceById(db, occurrenceId);
        if (!occurrence) {
          throw new Error('La ocurrencia ya no existe.');
        }
        const [rule, activeFunds] = await Promise.all([
          getRuleById(db, occurrence.ruleId),
          getFundsWithBalances(db, false),
        ]);
        if (!activeRequest) return;
        const ruleName = rule?.name ?? 'Gasto recurrente';
        setFormData({
          ruleName,
          amountText: occurrence.projectedAmount != null ? String(occurrence.projectedAmount) : '',
          category: occurrence.category,
          description: ruleName,
          fundId: occurrence.fundAssignmentMode === 'fixed' ? occurrence.fundId : null,
          funds: activeFunds.map((fund) => ({
            id: fund.id,
            name: fund.name,
            icon: fund.icon,
            color: fund.color,
          })),
          activeFundOptions: activeFunds.map((fund) => ({
            id: fund.id,
            isDefault: fund.isDefault,
          })),
        });
      } catch (err) {
        if (activeRequest) {
          setLoadError(err instanceof Error ? err.message : 'No se pudo cargar la ocurrencia.');
        }
      } finally {
        if (activeRequest) setLoading(false);
      }
    })();

    return () => {
      activeRequest = false;
    };
  }, [db, occurrenceId]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!formData) {
    return (
      <View style={styles.loading}>
        <Text style={styles.errorText}>{loadError ?? 'No se pudo cargar la ocurrencia.'}</Text>
      </View>
    );
  }

  return (
    <PaymentForm
      data={formData}
      db={db}
      navigation={navigation}
      occurrenceId={occurrenceId}
    />
  );
}

interface PaymentFormProps {
  data: PaymentFormData;
  db: SqlDatabase;
  navigation: Props['navigation'];
  occurrenceId: number;
}

function PaymentForm({ data, db, navigation, occurrenceId }: PaymentFormProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // This child mounts only after the occurrence data is ready, so the hook
  // receives the real initial values on its first render.
  const form = useMovementForm({
    lockedType: 'gasto',
    initialAmountText: data.amountText,
    initialCategory: data.category,
    initialDescription: data.description,
    initialSourceFundId: data.fundId,
    activeFunds: data.activeFundOptions,
  });

  const handleConfirm = useCallback(async () => {
    if (saving || !form.canSubmit) return;
    const result = form.buildResult(`[recurrente] ${form.description.trim()}`);
    if (!result.movement) {
      setError(result.error);
      return;
    }
    const activeIds = new Set(data.activeFundOptions.map((fund) => fund.id));
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
  }, [saving, form, data.activeFundOptions, db, occurrenceId, navigation]);

  return (
    <KeyboardAwareScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      bottomOffset={24}
      extraKeyboardSpace={24}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>Registrar pago de {data.ruleName}</Text>

      <MovementFormFields form={form} funds={data.funds} />

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
    </KeyboardAwareScrollView>
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
