import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import {
  getExpenseCategoryTotals,
  getMonthlyTrend,
  type CategoryTotal,
  type MonthlyTrendPoint,
} from '../db/database';
import { formatCurrency } from '../utils/format';

const CHART_HEIGHT = 120;

export default function SummaryScreen() {
  const db = useSQLiteContext();
  const [totals, setTotals] = useState<CategoryTotal[]>([]);
  const [trend, setTrend] = useState<MonthlyTrendPoint[]>([]);

  useFocusEffect(
    useCallback(() => {
      Promise.all([getExpenseCategoryTotals(db), getMonthlyTrend(db, 6)]).then(
        ([categoryTotals, monthlyTrend]) => {
          setTotals(categoryTotals);
          setTrend(monthlyTrend);
        }
      );
    }, [db])
  );

  const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);
  const maxTrendValue = Math.max(1, ...trend.flatMap((p) => [p.income, p.expense]));

  return (
    <View style={styles.container}>
      <FlatList
        data={totals}
        keyExtractor={(item) => item.category}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.trendSection}>
            <Text style={styles.sectionTitle}>Últimos 6 meses</Text>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.incomeDot]} />
                <Text style={styles.legendText}>Ingresos</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.expenseDot]} />
                <Text style={styles.legendText}>Gastos</Text>
              </View>
            </View>
            {trend.length > 0 ? (
              <View style={styles.trendChart}>
                {trend.map((point) => (
                  <View key={point.monthKey} style={styles.trendColumn}>
                    <View style={styles.trendBars}>
                      <View
                        style={[
                          styles.trendBar,
                          styles.expenseBar,
                          { height: Math.max(2, (point.expense / maxTrendValue) * CHART_HEIGHT) },
                        ]}
                      />
                      <View
                        style={[
                          styles.trendBar,
                          styles.incomeBar,
                          { height: Math.max(2, (point.income / maxTrendValue) * CHART_HEIGHT) },
                        ]}
                      />
                    </View>
                    <Text style={styles.trendLabel}>{point.monthLabel}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={styles.sectionTitle}>Gastos por categoría</Text>
          </View>
        }
        renderItem={({ item }) => {
          const pct = grandTotal > 0 ? (item.total / grandTotal) * 100 : 0;
          return (
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.category}>{item.category}</Text>
                <Text style={styles.amount}>{formatCurrency(item.total)}</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.pctText}>{pct.toFixed(1)}%</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Todavía no hay gastos para resumir.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  trendSection: { marginBottom: 12 },
  legendRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  incomeDot: { backgroundColor: '#16a34a' },
  expenseDot: { backgroundColor: '#dc2626' },
  legendText: { fontSize: 12, color: '#666' },
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
  expenseBar: { backgroundColor: '#dc2626' },
  incomeBar: { backgroundColor: '#16a34a' },
  trendLabel: { fontSize: 11, color: '#666', marginTop: 6, textTransform: 'capitalize' },
  row: { marginBottom: 18 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  category: { fontSize: 16, fontWeight: '600' },
  amount: { fontSize: 16, fontWeight: '700' },
  barTrack: {
    height: 10,
    backgroundColor: '#eee',
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: '#2563eb', borderRadius: 5 },
  pctText: { fontSize: 12, color: '#999', marginTop: 4 },
  emptyText: { textAlign: 'center', color: '#999', marginTop: 40 },
});
