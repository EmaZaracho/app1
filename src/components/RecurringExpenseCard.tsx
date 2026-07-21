import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { OccurrenceStatusBadge } from './OccurrenceStatusBadge';
import { iconForCategory } from '../categoryVisuals';
import { formatCurrency } from '../utils/format';
import type { RecurringExpenseOccurrence } from '../types/recurringExpenses';

export interface OccurrencePaymentInfo {
  realAmount: number;
  paidDate: string; // YYYY-MM-DD
}

interface RecurringExpenseCardProps {
  occurrence: RecurringExpenseOccurrence;
  ruleName: string;
  fundName: string | null;
  payment: OccurrencePaymentInfo | null;
  onPress: () => void;
}

export function RecurringExpenseCard({
  occurrence,
  ruleName,
  fundName,
  payment,
  onPress,
}: RecurringExpenseCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const amountLabel =
    occurrence.projectedAmount == null ? 'Importe desconocido' : formatCurrency(occurrence.projectedAmount);
  const fundLabel =
    occurrence.fundAssignmentMode === 'ask_on_payment' && occurrence.fundId == null
      ? 'Fondo pendiente'
      : fundName ?? 'Fondo';

  const diff =
    payment && occurrence.projectedAmount != null ? payment.realAmount - occurrence.projectedAmount : null;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.headerRow}>
        <Text style={styles.name}>
          {iconForCategory(occurrence.category)} {ruleName}
        </Text>
        <OccurrenceStatusBadge status={occurrence.effectiveStatus} />
      </View>
      <Text style={styles.meta}>
        {amountLabel} · {fundLabel}
      </Text>
      <Text style={styles.meta}>
        {occurrence.category} · Programado {occurrence.scheduledDate}
        {occurrence.scheduledDate !== occurrence.originalScheduledDate
          ? ` (original ${occurrence.originalScheduledDate})`
          : ''}
      </Text>
      {payment ? (
        <Text style={styles.paidMeta}>
          Pagado {payment.paidDate} · {formatCurrency(payment.realAmount)}
          {diff != null && Math.abs(diff) >= 0.005
            ? ` · Dif. ${diff > 0 ? '+' : ''}${formatCurrency(diff)}`
            : ''}
        </Text>
      ) : null}
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    name: { fontSize: 15, fontWeight: '700', color: theme.text, flex: 1 },
    meta: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },
    paidMeta: { fontSize: 12, color: theme.success, marginTop: 4, fontWeight: '600' },
  });
}
