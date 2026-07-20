import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { formatCurrency } from '../utils/format';
import { iconForCategory } from '../categoryVisuals';
import type { CategoryExpenseInsight } from '../types/financialAnalytics';

const PRIORITY_LABEL = { essential: 'Esencial', flexible: 'Flexible', discretionary: 'Discrecional' } as const;

export function CategoryOpportunityCard({ item }: { item: CategoryExpenseInsight }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.row}>
      <View style={styles.headerRow}>
        <Text style={styles.category}>
          {iconForCategory(item.category)} {item.category}
        </Text>
        <Text style={styles.priorityTag}>{PRIORITY_LABEL[item.priority]}</Text>
      </View>
      <View style={styles.amountRow}>
        <Text style={styles.amount}>{formatCurrency(item.amount)}</Text>
        <Text style={styles.pct}>{item.percentageOfTotalExpenses.toFixed(1)}% del gasto</Text>
      </View>
      {item.previousPeriodChangePercentage != null ? (
        <Text
          style={[styles.change, { color: item.previousPeriodChangePercentage > 0 ? theme.danger : theme.success }]}
        >
          {item.previousPeriodChangePercentage > 0 ? '↑' : '↓'}{' '}
          {Math.abs(item.previousPeriodChangePercentage).toFixed(1)}% vs. período anterior
        </Text>
      ) : null}
      {item.currentBudget != null ? (
        <Text style={styles.budgetText}>
          Presupuesto: {formatCurrency(item.currentBudget)} ({(item.budgetUsagePercentage ?? 0).toFixed(0)}% usado)
        </Text>
      ) : null}
      {item.potentialSavings > 0 ? (
        <Text style={styles.opportunity}>
          Ahorro potencial: hasta {formatCurrency(item.potentialSavings)} (reducción sugerida{' '}
          {item.suggestedReductionPercentage}%)
        </Text>
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    category: { fontSize: 15, fontWeight: '600', color: theme.text },
    priorityTag: { fontSize: 11, color: theme.textMuted, fontWeight: '600', textTransform: 'uppercase' },
    amountRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
    amount: { fontSize: 16, fontWeight: '700', color: theme.text },
    pct: { fontSize: 12, color: theme.textMuted },
    change: { fontSize: 12, marginTop: 4, fontWeight: '600' },
    budgetText: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },
    opportunity: { fontSize: 12, color: theme.primary, marginTop: 6 },
  });
}
