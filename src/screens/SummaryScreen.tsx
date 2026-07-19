import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import {
  getCurrentMonthExpenseCategoryTotals,
  getExpenseCategoryTotals,
  getMonthlyTrend,
  type CategoryTotal,
  type MonthlyTrendPoint,
} from '../db/database';
import { formatCurrency } from '../utils/format';
import { iconForCategory, colorForCategory } from '../categoryVisuals';
import { useTheme, type Theme } from '../theme';

const CHART_HEIGHT = 120;
const DONUT_RADIUS = 58;
const DONUT_STROKE = 22;
const DONUT_SIZE = (DONUT_RADIUS + DONUT_STROKE) * 2;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const DONUT_GAP = 3;

type Range = 'month' | 'all';

function DonutChart({ data, theme }: { data: CategoryTotal[]; theme: Theme }) {
  const total = data.reduce((sum, d) => sum + d.total, 0);
  let cumulative = 0;

  return (
    <View style={{ width: DONUT_SIZE, height: DONUT_SIZE }}>
      <Svg width={DONUT_SIZE} height={DONUT_SIZE} viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}>
        <Circle
          cx={DONUT_SIZE / 2}
          cy={DONUT_SIZE / 2}
          r={DONUT_RADIUS}
          stroke={theme.surfaceAlt}
          strokeWidth={DONUT_STROKE}
          fill="none"
        />
        {total > 0
          ? data.map((d) => {
              const fraction = d.total / total;
              const sliceLength = Math.max(0, fraction * DONUT_CIRCUMFERENCE - DONUT_GAP);
              const dashOffset = -cumulative * DONUT_CIRCUMFERENCE;
              cumulative += fraction;
              return (
                <Circle
                  key={d.category}
                  cx={DONUT_SIZE / 2}
                  cy={DONUT_SIZE / 2}
                  r={DONUT_RADIUS}
                  stroke={colorForCategory(d.category, theme.scheme)}
                  strokeWidth={DONUT_STROKE}
                  strokeDasharray={`${sliceLength} ${DONUT_CIRCUMFERENCE}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="butt"
                  fill="none"
                  rotation={-90}
                  origin={`${DONUT_SIZE / 2}, ${DONUT_SIZE / 2}`}
                />
              );
            })
          : null}
      </Svg>
      <View style={styles.donutCenter} pointerEvents="none">
        <Text style={[styles.donutCenterValue, { color: theme.text }]} numberOfLines={1}>
          {formatCurrency(total)}
        </Text>
        <Text style={[styles.donutCenterLabel, { color: theme.textMuted }]}>gastado</Text>
      </View>
    </View>
  );
}

export default function SummaryScreen() {
  const theme = useTheme();
  const themedStyles = useMemo(() => createStyles(theme), [theme]);
  const db = useSQLiteContext();
  const [range, setRange] = useState<Range>('month');
  const [totals, setTotals] = useState<CategoryTotal[]>([]);
  const [trend, setTrend] = useState<MonthlyTrendPoint[]>([]);

  const load = useCallback(async () => {
    const [categoryTotals, monthlyTrend] = await Promise.all([
      range === 'month' ? getCurrentMonthExpenseCategoryTotals(db) : getExpenseCategoryTotals(db),
      getMonthlyTrend(db, 6),
    ]);
    setTotals(categoryTotals);
    setTrend(monthlyTrend);
  }, [db, range]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);
  const maxTrendValue = Math.max(1, ...trend.flatMap((p) => [p.income, p.expense]));

  return (
    <View style={themedStyles.container}>
      <FlatList
        data={totals}
        keyExtractor={(item) => item.category}
        contentContainerStyle={themedStyles.listContent}
        ListHeaderComponent={
          <View style={themedStyles.trendSection}>
            <Text style={themedStyles.sectionTitle}>Últimos 6 meses</Text>
            <View style={themedStyles.legendRow}>
              <View style={themedStyles.legendItem}>
                <View style={[themedStyles.legendDot, { backgroundColor: theme.success }]} />
                <Text style={themedStyles.legendText}>Ingresos</Text>
              </View>
              <View style={themedStyles.legendItem}>
                <View style={[themedStyles.legendDot, { backgroundColor: theme.danger }]} />
                <Text style={themedStyles.legendText}>Gastos</Text>
              </View>
            </View>
            {trend.length > 0 ? (
              <View style={themedStyles.trendChart}>
                {trend.map((point) => (
                  <View key={point.monthKey} style={themedStyles.trendColumn}>
                    <View style={themedStyles.trendBars}>
                      <View
                        style={[
                          themedStyles.trendBar,
                          { backgroundColor: theme.danger },
                          { height: Math.max(2, (point.expense / maxTrendValue) * CHART_HEIGHT) },
                        ]}
                      />
                      <View
                        style={[
                          themedStyles.trendBar,
                          { backgroundColor: theme.success },
                          { height: Math.max(2, (point.income / maxTrendValue) * CHART_HEIGHT) },
                        ]}
                      />
                    </View>
                    <Text style={themedStyles.trendLabel}>{point.monthLabel}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={themedStyles.sectionHeaderRow}>
              <Text style={themedStyles.sectionTitle}>Gastos por categoría</Text>
              <View style={themedStyles.rangeToggle}>
                {(
                  [
                    { label: 'Este mes', value: 'month' as Range },
                    { label: 'Todo', value: 'all' as Range },
                  ] as const
                ).map((opt) => (
                  <Text
                    key={opt.value}
                    onPress={() => setRange(opt.value)}
                    style={[
                      themedStyles.rangeChip,
                      range === opt.value && themedStyles.rangeChipSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                ))}
              </View>
            </View>

            {totals.length > 0 ? (
              <View style={themedStyles.donutWrap}>
                <DonutChart data={totals} theme={theme} />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => {
          const pct = grandTotal > 0 ? (item.total / grandTotal) * 100 : 0;
          const categoryColor = colorForCategory(item.category, theme.scheme);
          return (
            <View style={themedStyles.row}>
              <View style={themedStyles.rowHeader}>
                <Text style={themedStyles.category}>
                  {iconForCategory(item.category)} {item.category}
                </Text>
                <Text style={themedStyles.amount}>{formatCurrency(item.total)}</Text>
              </View>
              <View style={themedStyles.barTrack}>
                <View
                  style={[themedStyles.barFill, { width: `${pct}%`, backgroundColor: categoryColor }]}
                />
              </View>
              <Text style={themedStyles.pctText}>{pct.toFixed(1)}%</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={themedStyles.emptyText}>
            {range === 'month' ? 'Todavía no hay gastos este mes.' : 'Todavía no hay gastos para resumir.'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  donutCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  donutCenterValue: { fontSize: 15, fontWeight: '700' },
  donutCenterLabel: { fontSize: 11, marginTop: 2 },
});

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    listContent: { padding: 16 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    rangeToggle: { flexDirection: 'row', gap: 6 },
    rangeChip: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.textSecondary,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
      overflow: 'hidden',
    },
    rangeChipSelected: {
      backgroundColor: theme.chipSelectedBg,
      borderColor: theme.chipSelectedBg,
      color: theme.chipSelectedText,
    },
    trendSection: { marginBottom: 12 },
    legendRow: { flexDirection: 'row', gap: 16, marginBottom: 12, marginTop: 12 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 12, color: theme.textSecondary },
    trendChart: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'flex-end',
      marginBottom: 24,
    },
    trendColumn: { alignItems: 'center' },
    trendBars: {
      flexDirection: 'row',
      gap: 4,
      height: CHART_HEIGHT,
      alignItems: 'flex-end',
    },
    trendBar: { width: 10, borderRadius: 3 },
    trendLabel: { fontSize: 11, color: theme.textSecondary, marginTop: 6, textTransform: 'capitalize' },
    donutWrap: { alignItems: 'center', marginBottom: 20 },
    row: { marginBottom: 18 },
    rowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
    category: { fontSize: 16, fontWeight: '600', color: theme.text },
    amount: { fontSize: 16, fontWeight: '700', color: theme.text },
    barTrack: {
      height: 10,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 5,
      overflow: 'hidden',
    },
    barFill: { height: '100%', borderRadius: 5 },
    pctText: { fontSize: 12, color: theme.textMuted, marginTop: 4 },
    emptyText: { textAlign: 'center', color: theme.textMuted, marginTop: 40 },
  });
}
