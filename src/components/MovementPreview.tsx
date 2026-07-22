import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMovementForm } from '../hooks/useMovementForm';
import { useKeyboardAwareScroll } from '../hooks/useKeyboardAwareScroll';
import { MovementFormFields } from './MovementFormFields';
import { formatCurrency } from '../utils/format';
import { useTheme, type Theme } from '../theme';
import type { AIMovementType, Category, FundWithBalance, NewMovement } from '../types';

interface MovementPreviewProps {
  initialType: AIMovementType;
  initialAmountText: string;
  initialCategory: Category | null;
  initialDescription: string;
  initialSourceFundId: number | null;
  initialDestinationFundId: number | null;
  rawText: string;
  funds: FundWithBalance[];
  defaultFundId: number | null;
  onCancel: () => void;
  onConfirm: (movement: NewMovement) => Promise<void> | void;
}

/**
 * Vista previa editable del resultado de IA: usa exactamente los mismos
 * campos (`MovementFormFields`) que el registro manual y el pago recurrente.
 */
export function MovementPreview({
  initialType,
  initialAmountText,
  initialCategory,
  initialDescription,
  initialSourceFundId,
  initialDestinationFundId,
  rawText,
  funds,
  defaultFundId,
  onCancel,
  onConfirm,
}: MovementPreviewProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [error, setError] = useState<string | null>(null);
  const kb = useKeyboardAwareScroll();

  const selectableFunds = useMemo(
    () => funds.map((f) => ({ id: f.id, name: f.name, icon: f.icon, color: f.color })),
    [funds]
  );
  const activeFundOptions = useMemo(() => funds.map((f) => ({ id: f.id, isDefault: f.isDefault })), [funds]);

  const form = useMovementForm({
    initialType,
    initialAmountText,
    initialCategory,
    initialDescription,
    initialSourceFundId,
    initialDestinationFundId,
    activeFunds: activeFundOptions,
    defaultFundId,
  });

  const negativeWarning = useMemo(() => {
    if (!form.amountValid || form.sourceFundId == null) return null;
    const amount = Number(form.amountText.replace(',', '.'));
    const fund = funds.find((f) => f.id === form.sourceFundId);
    if (!fund) return null;
    if (fund.balance - amount < 0) {
      return `${fund.name} quedará en negativo (${formatCurrency(fund.balance - amount)}).`;
    }
    return null;
  }, [form.amountValid, form.amountText, form.sourceFundId, funds]);

  function handleConfirm() {
    const result = form.buildResult(rawText);
    if (!result.movement) {
      setError(result.error);
      return;
    }
    setError(null);
    onConfirm(result.movement);
  }

  return (
    <ScrollView
      ref={kb.scrollRef}
      style={styles.previewCard}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      onScroll={kb.onScroll}
      scrollEventThrottle={kb.scrollEventThrottle}
    >
      <MovementFormFields form={form} funds={selectableFunds} onInputFocus={kb.registerFocusedInput} />

      {negativeWarning ? <Text style={styles.warningText}>⚠️ {negativeWarning}</Text> : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.previewActions}>
        <Pressable style={styles.previewCancelButton} onPress={onCancel}>
          <Text style={styles.previewCancelText}>Cancelar</Text>
        </Pressable>
        <Pressable
          style={[styles.previewConfirmButton, !form.canSubmit && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={!form.canSubmit}
        >
          <Text style={styles.previewConfirmText}>Confirmar</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    previewCard: {
      maxHeight: 380,
      padding: 16,
      backgroundColor: theme.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    warningText: { color: theme.warningText, fontSize: 13, marginTop: 10 },
    errorText: { color: theme.danger, fontSize: 13, marginTop: 10 },
    previewActions: { flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 8 },
    previewCancelButton: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    previewCancelText: { color: theme.textSecondary, fontWeight: '600' },
    previewConfirmButton: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
      borderRadius: 10,
      backgroundColor: theme.primary,
    },
    buttonDisabled: { opacity: 0.5 },
    previewConfirmText: { color: theme.primaryText, fontWeight: '700' },
  });
}
