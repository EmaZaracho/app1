import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import { getTotalsByCategory, type CategoryTotal } from '../db/database';

export default function SummaryScreen() {
  const db = useSQLiteContext();
  const [totals, setTotals] = useState<CategoryTotal[]>([]);

  useFocusEffect(
    useCallback(() => {
      getTotalsByCategory(db).then(setTotals);
    }, [db])
  );

  const grandTotal = totals.reduce((sum, t) => sum + t.total, 0);

  return (
    <View style={styles.container}>
      <FlatList
        data={totals}
        keyExtractor={(item) => item.category}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const pct = grandTotal > 0 ? (item.total / grandTotal) * 100 : 0;
          return (
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.category}>{item.category}</Text>
                <Text style={styles.amount}>${item.total.toFixed(2)}</Text>
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
