import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDb } from '../db/useDb';
import type { ExpenseCategory, Movement, RootStackParamList } from '../types';
import { formatDayMonthYear } from '../domain/periodInput';
import { categoryChange, previousMonthComparison, type ComparisonPeriod } from '../domain/categoryChange';
import {
  getExpenseCategoryTotals,
  getExpenseCategoryTotalsForMonth,
  getExpenseCategoryTotalsForRange,
  getExpensesForCategory,
  getMonthlyTrend,
  monthRange,
  isFutureMonthKey,
  sumMonthlyTrend,
  type CategoryTotal,
  type MonthlyTrendPoint,
  type TrendRange,
} from '../db/database';
import { formatCurrency } from '../utils/format';
import { iconForCategory, colorForCategory } from '../categoryVisuals';
import { useTheme, type Theme } from '../theme';
import { getTrackingStart } from '../db/financialPreferencesRepository';
import { monthLabel, shiftMonthKey, toMonthKey } from '../recurring/recurringDateUtils';

const CHART_HEIGHT = 120;
const DONUT_RADIUS = 58;
const DONUT_STROKE = 22;
const DONUT_SIZE = (DONUT_RADIUS + DONUT_STROKE) * 2;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const DONUT_GAP = 3;

type Range = 'month' | 'all';

const TREND_RANGE_OPTIONS: { label: string; value: TrendRange }[] = [
  { label: '6 meses', value: 6 },
  { label: '12 meses', value: 12 },
  { label: 'Todo', value: 'all' },
];

function trendSectionTitle(range: TrendRange): string {
  if (range === 'all') return 'Todo el historial';
  return `Últimos ${range} meses`;
}

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

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SummaryScreen() {
  const theme = useTheme();
  const themedStyles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const navigation = useNavigation<Nav>();
  const [range, setRange] = useState<Range>('month');
  const [trendRange, setTrendRange] = useState<TrendRange>(6);
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => toMonthKey(new Date()));
  const [totals, setTotals] = useState<CategoryTotal[]>([]);
  const [trend, setTrend] = useState<MonthlyTrendPoint[]>([]);
  const [previousTotals, setPreviousTotals] = useState<Map<string, number> | null>(null);
  const [comparison, setComparison] = useState<ComparisonPeriod | null>(null);
  const [expanded, setExpanded] = useState<ExpenseCategory | null>(null);
  const [expandedMovements, setExpandedMovements] = useState<Movement[]>([]);

  const load = useCallback(async () => {
    const trackingStart = await getTrackingStart(db);
    // Solo el modo mensual compara; "Todo" no tiene un período anterior.
    const nextComparison = range === 'month' ? previousMonthComparison(selectedMonthKey) : null;
    const [categoryTotals, monthlyTrend, previous] = await Promise.all([
      range === 'month'
        ? getExpenseCategoryTotalsForMonth(db, selectedMonthKey, trackingStart)
        : getExpenseCategoryTotals(db, trackingStart),
      getMonthlyTrend(db, trendRange, trackingStart),
      nextComparison
        ? getExpenseCategoryTotalsForRange(db, nextComparison.range, trackingStart)
        : Promise.resolve(null),
    ]);
    setComparison(nextComparison);
    setPreviousTotals(previous ? new Map(previous.map((t) => [t.category, t.total])) : null);
    setTotals(categoryTotals);
    setTrend(monthlyTrend);
  }, [db, range, trendRange, selectedMonthKey]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Cambiar de mes o de rango deja de mostrar los gastos de la categoría abierta.
  useEffect(() => {
    setExpanded(null);
  }, [range, selectedMonthKey]);

  // Recarga los gastos de la categoría abierta cuando cambian los totales (p. ej. al volver de editar).
  useEffect(() => {
    if (!expanded) {
      setExpandedMovements([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const trackingStart = await getTrackingStart(db);
      const movements = await getExpensesForCategory(
        db,
        expanded,
        range === 'month' ? monthRange(selectedMonthKey) : null,
        trackingStart
      );
      if (!cancelled) setExpandedMovements(movements);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, expanded, range, selectedMonthKey, totals]);

  const toggleCategory = useCallback((category: ExpenseCategory) => {
    setExpanded((current) => (current === category ? null : category));
  }, []);

  const goMonth = useCallback((delta: number) => {
    setSelectedMonthKey((mk) => {
      const next = shiftMonthKey(mk, delta);
      return isFutureMonthKey(next) ? mk : next;
    });
  }, []);

  const atCurrentMonth = selectedMonthKey === toMonthKey(new Date());

  const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);
  const maxTrendValue = Math.max(1, ...trend.flatMap((p) => [p.income, p.expense]));
  const trendTotals = useMemo(() => sumMonthlyTrend(trend), [trend]);

  return (
    <View style={themedStyles.container}>
      <FlatList
        data={totals}
        keyExtractor={(item) => item.category}
        contentContainerStyle={themedStyles.listContent}
        ListHeaderComponent={
          <View style={themedStyles.trendSection}>
            <Pressable
              style={themedStyles.insightsButton}
              onPress={() => navigation.navigate('FinancialInsights')}
            >
              <Text style={themedStyles.insightsButtonText}>📈 Análisis financiero y recomendaciones</Text>
            </Pressable>

            <View style={themedStyles.sectionHeaderRow}>
              <Text style={themedStyles.sectionTitle}>{trendSectionTitle(trendRange)}</Text>
              <View style={themedStyles.rangeToggle}>
                {TREND_RANGE_OPTIONS.map((opt) => (
                  <Text
                    key={String(opt.value)}
                    onPress={() => setTrendRange(opt.value)}
                    style={[
                      themedStyles.rangeChip,
                      trendRange === opt.value && themedStyles.rangeChipSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                ))}
              </View>
            </View>
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
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={themedStyles.trendChartContent}
              >
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
              </ScrollView>
            ) : null}

            <View style={themedStyles.trendTotalsRow}>
              <View style={themedStyles.trendTotalItem}>
                <Text style={themedStyles.trendTotalLabel}>Ingresos</Text>
                <Text style={[themedStyles.trendTotalValue, { color: theme.success }]}>
                  {formatCurrency(trendTotals.income)}
                </Text>
              </View>
              <View style={themedStyles.trendTotalItem}>
                <Text style={themedStyles.trendTotalLabel}>Gastos</Text>
                <Text style={[themedStyles.trendTotalValue, { color: theme.danger }]}>
                  {formatCurrency(trendTotals.expense)}
                </Text>
              </View>
              <View style={themedStyles.trendTotalItem}>
                <Text style={themedStyles.trendTotalLabel}>Balance neto</Text>
                <Text
                  style={[
                    themedStyles.trendTotalValue,
                    { color: trendTotals.balance < 0 ? theme.danger : theme.success },
                  ]}
                >
                  {formatCurrency(trendTotals.balance)}
                </Text>
              </View>
            </View>

            <View style={themedStyles.sectionHeaderRow}>
              <Text style={themedStyles.sectionTitle}>Gastos por categoría</Text>
              <View style={themedStyles.rangeToggle}>
                {(
                  [
                    { label: 'Mensual', value: 'month' as Range },
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

            {range === 'month' ? (
              <View style={themedStyles.monthNav}>
                <Pressable onPress={() => goMonth(-1)} hitSlop={12}>
                  <Text style={themedStyles.monthArrow}>‹</Text>
                </Pressable>
                <Text style={themedStyles.monthNavLabel}>{monthLabel(selectedMonthKey)}</Text>
                <Pressable onPress={() => goMonth(1)} hitSlop={12} disabled={atCurrentMonth}>
                  <Text
                    style={[themedStyles.monthArrow, atCurrentMonth && themedStyles.monthArrowDisabled]}
                  >
                    ›
                  </Text>
                </Pressable>
              </View>
            ) : null}

            {comparison?.partial ? (
              <Text style={themedStyles.comparisonNote}>
                Se compara con los primeros {comparison.days} días del mes anterior.
              </Text>
            ) : null}

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
          const change = previousTotals ? categoryChange(item.total, previousTotals.get(item.category) ?? 0) : null;
          const isExpanded = expanded === item.category;
          return (
            <View style={themedStyles.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: isExpanded }}
                onPress={() => toggleCategory(item.category as ExpenseCategory)}
              >
                <View style={themedStyles.rowHeader}>
                  <Text style={themedStyles.category}>
                    {iconForCategory(item.category)} {item.category} {isExpanded ? '▾' : '▸'}
                  </Text>
                  <Text style={themedStyles.amount}>{formatCurrency(item.total)}</Text>
                </View>
                <View style={themedStyles.barTrack}>
                  <View
                    style={[themedStyles.barFill, { width: `${pct}%`, backgroundColor: categoryColor }]}
                  />
                </View>
                <View style={themedStyles.pctRow}>
                  <Text style={themedStyles.pctText}>{pct.toFixed(1)}%</Text>
                  {change ? (
                    <Text
                      style={[
                        themedStyles.changeText,
                        change.kind === 'up' && { color: theme.danger },
                        change.kind === 'down' && { color: theme.success },
                      ]}
                    >
                      {change.kind === 'up'
                        ? `▲ ${change.percent}% vs. mes anterior`
                        : change.kind === 'down'
                          ? `▼ ${change.percent}% vs. mes anterior`
                          : change.kind === 'new'
                            ? 'Sin gasto el mes anterior'
                            : 'Igual que el mes anterior'}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              {isExpanded ? (
                <View style={themedStyles.detailList}>
                  {expandedMovements.map((m) => (
                    <View key={m.id} style={themedStyles.detailRow}>
                      <View style={themedStyles.detailInfo}>
                        <Text style={themedStyles.detailDescription} numberOfLines={2}>
                          {m.description || 'Sin descripción'}
                        </Text>
                        <Text style={themedStyles.detailDate}>{formatDayMonthYear(m.createdAt)}</Text>
                      </View>
                      <Text style={themedStyles.detailAmount}>{formatCurrency(m.amount)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={themedStyles.emptyText}>
            {range === 'month'
              ? atCurrentMonth
                ? 'Todavía no hay gastos este mes.'
                : `Todavía no hay gastos en ${monthLabel(selectedMonthKey)}.`
              : 'Todavía no hay gastos para resumir.'}
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
    insightsButton: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 16,
    },
    insightsButtonText: { color: theme.primaryText, fontWeight: '700', fontSize: 14 },
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
    trendChartContent: {
      flexGrow: 1,
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'flex-end',
      gap: 14,
      paddingHorizontal: 4,
      marginBottom: 24,
    },
    trendColumn: { alignItems: 'center', minWidth: 34 },
    trendBars: {
      flexDirection: 'row',
      gap: 4,
      height: CHART_HEIGHT,
      alignItems: 'flex-end',
    },
    trendBar: { width: 10, borderRadius: 3 },
    trendLabel: { fontSize: 11, color: theme.textSecondary, marginTop: 6, textTransform: 'capitalize' },
    trendTotalsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 24,
    },
    trendTotalItem: { flex: 1, alignItems: 'center' },
    trendTotalLabel: { fontSize: 11, color: theme.textMuted },
    trendTotalValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
    monthNav: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    monthArrow: { fontSize: 22, color: theme.primary, fontWeight: '700', paddingHorizontal: 12 },
    monthArrowDisabled: { color: theme.textMuted, opacity: 0.4 },
    monthNavLabel: { fontSize: 14, fontWeight: '700', color: theme.text, textTransform: 'capitalize' },
    donutWrap: { alignItems: 'center', marginBottom: 20 },
    row: { marginBottom: 18 },
    rowHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
    category: { fontSize: 16, fontWeight: '600', color: theme.text, flexShrink: 1 },
    amount: { fontSize: 16, fontWeight: '700', color: theme.text, flexShrink: 0 },
    barTrack: {
      height: 10,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 5,
      overflow: 'hidden',
    },
    barFill: { height: '100%', borderRadius: 5 },
    pctRow: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 4 },
    pctText: { fontSize: 12, color: theme.textMuted },
    changeText: { fontSize: 12, fontWeight: '600', color: theme.textMuted, flexShrink: 1, textAlign: 'right' },
    comparisonNote: { fontSize: 12, color: theme.textMuted, marginBottom: 12, textAlign: 'center' },
    detailList: {
      marginTop: 8,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    detailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
    },
    detailInfo: { flex: 1 },
    detailDescription: { fontSize: 14, color: theme.text },
    detailDate: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
    detailAmount: { fontSize: 14, fontWeight: '600', color: theme.text, flexShrink: 0 },
    emptyText: { textAlign: 'center', color: theme.textMuted, marginTop: 40 },
  });
}
