import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { formatCurrency } from '../utils/format';
import type { MonthlyProjectionSummary as Summary } from '../types/recurringExpenses';

export function MonthlyProjectionSummary({ summary }: { summary: Summary }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.card}>
      <Row label="Pagado realmente" value={formatCurrency(summary.paidActualTotal)} color={theme.success} styles={styles} />
      <Row
        label="Pendiente proyectado"
        value={formatCurrency(summary.pendingProjectedKnownTotal)}
        color={theme.primary}
        styles={styles}
      />
      <Row
        label="Posible total mensual"
        value={formatCurrency(summary.possibleMonthTotal)}
        color={theme.text}
        bold
        styles={styles}
      />
      {summary.unknownPendingCount > 0 ? (
        <Text style={styles.note}>
          Además hay {summary.unknownPendingCount} gasto{summary.unknownPendingCount === 1 ? '' : 's'} con importe
          desconocido.
        </Text>
      ) : null}
      {summary.skippedCount > 0 || summary.cancelledCount > 0 ? (
        <Text style={styles.note}>
          {summary.skippedCount} omitido{summary.skippedCount === 1 ? '' : 's'} ·{' '}
          {summary.cancelledCount} cancelado{summary.cancelledCount === 1 ? '' : 's'}
        </Text>
      ) : null}
      <Text style={styles.disclaimer}>El posible total es una proyección, no una certeza.</Text>
    </View>
  );
}

function Row({
  label,
  value,
  color,
  bold,
  styles,
}: {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color }, bold && styles.valueBold]}>{value}</Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    label: { fontSize: 13, color: theme.textSecondary },
    value: { fontSize: 14, fontWeight: '600' },
    valueBold: { fontSize: 16, fontWeight: '800' },
    note: { fontSize: 12, color: theme.warningText, marginTop: 6 },
    disclaimer: { fontSize: 11, color: theme.textMuted, marginTop: 8, fontStyle: 'italic' },
  });
}
