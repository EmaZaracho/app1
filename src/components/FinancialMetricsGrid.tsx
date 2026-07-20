import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { formatCurrency } from '../utils/format';
import type { FinancialSnapshot, PeriodFinancials } from '../types/financialAnalytics';

export function FinancialMetricsGrid({ snapshot }: { snapshot: FinancialSnapshot }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { totals, previousPeriod, previousPeriodsAverage } = snapshot;

  return (
    <View style={styles.grid}>
      <View style={styles.metricCell}>
        <Text style={styles.metricLabel}>Ingresos</Text>
        <Text style={[styles.metricValue, { color: theme.success }]}>{formatCurrency(totals.income)}</Text>
      </View>
      <View style={styles.metricCell}>
        <Text style={styles.metricLabel}>Gastos</Text>
        <Text style={[styles.metricValue, { color: theme.danger }]}>{formatCurrency(totals.expense)}</Text>
      </View>
      <View style={styles.metricCell}>
        <Text style={styles.metricLabel}>Ahorro operativo</Text>
        <Text style={[styles.metricValue, { color: totals.operationalSavings < 0 ? theme.danger : theme.success }]}>
          {formatCurrency(totals.operationalSavings)}
        </Text>
      </View>
      <View style={styles.metricCell}>
        <Text style={styles.metricLabel}>Tasa de ahorro</Text>
        <Text style={[styles.metricValue, { color: theme.text }]}>
          {totals.savingsRate == null ? 'Sin ingresos' : `${(totals.savingsRate * 100).toFixed(1)}%`}
        </Text>
      </View>
      {totals.adjustmentsNet !== 0 ? (
        <View style={styles.metricCell}>
          <Text style={styles.metricLabel}>Ajustes netos</Text>
          <Text style={[styles.metricValue, { color: theme.textSecondary }]}>
            {formatCurrency(totals.adjustmentsNet)}
          </Text>
        </View>
      ) : null}

      <ComparisonRow label="vs. período anterior" current={totals} compare={previousPeriod} theme={theme} styles={styles} />
      <ComparisonRow
        label="vs. promedio de 3 períodos"
        current={totals}
        compare={previousPeriodsAverage}
        theme={theme}
        styles={styles}
      />
    </View>
  );
}

function ComparisonRow({
  label,
  current,
  compare,
  theme,
  styles,
}: {
  label: string;
  current: PeriodFinancials;
  compare: PeriodFinancials;
  theme: Theme;
  styles: ReturnType<typeof createStyles>;
}) {
  const diff = current.expense - compare.expense;
  const pct = compare.expense > 0 ? (diff / compare.expense) * 100 : null;
  const worse = diff > 0;
  return (
    <View style={styles.comparisonRow}>
      <Text style={styles.comparisonLabel}>{label}</Text>
      <Text style={[styles.comparisonValue, { color: worse ? theme.danger : theme.success }]}>
        {pct == null
          ? `${diff >= 0 ? '+' : ''}${formatCurrency(diff)} en gastos`
          : `${diff >= 0 ? '+' : ''}${pct.toFixed(1)}% en gastos`}
      </Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    metricCell: {
      width: '47%',
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    metricLabel: { fontSize: 12, color: theme.textMuted },
    metricValue: { fontSize: 18, fontWeight: '700', marginTop: 4 },
    comparisonRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
    comparisonLabel: { fontSize: 13, color: theme.textSecondary },
    comparisonValue: { fontSize: 13, fontWeight: '700' },
  });
}
