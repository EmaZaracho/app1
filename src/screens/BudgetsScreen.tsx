import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from '@react-navigation/native';
import { getBudgets, getCurrentMonthExpenseCategoryTotals, setBudget } from '../db/database';
import { formatCurrency } from '../utils/format';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types';

export default function BudgetsScreen() {
  const db = useSQLiteContext();
  const [limits, setLimits] = useState<Record<ExpenseCategory, string>>(
    () => Object.fromEntries(EXPENSE_CATEGORIES.map((cat) => [cat, ''])) as Record<ExpenseCategory, string>
  );
  const [spent, setSpent] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const [budgets, totals] = await Promise.all([
      getBudgets(db),
      getCurrentMonthExpenseCategoryTotals(db),
    ]);
    const nextLimits = Object.fromEntries(
      EXPENSE_CATEGORIES.map((cat) => [cat, ''])
    ) as Record<ExpenseCategory, string>;
    for (const budget of budgets) {
      nextLimits[budget.category] = String(budget.monthlyLimit);
    }
    setLimits(nextLimits);
    const nextSpent: Record<string, number> = {};
    for (const total of totals) {
      nextSpent[total.category] = total.total;
    }
    setSpent(nextSpent);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleSaveLimit(category: ExpenseCategory) {
    const raw = (limits[category] ?? '').replace(',', '.');
    const value = Number(raw);
    const limit = Number.isFinite(value) && value > 0 ? value : 0;
    await setBudget(db, category, limit);
    setLimits((prev) => ({ ...prev, [category]: limit > 0 ? String(limit) : '' }));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Definí un límite mensual por categoría. Cuando se supere, lo vas a ver marcado acá y en el
        resumen.
      </Text>
      <FlatList
        data={EXPENSE_CATEGORIES}
        keyExtractor={(item) => item}
        contentContainerStyle={styles.listContent}
        renderItem={({ item: category }) => {
          const limitValue = Number((limits[category] ?? '').replace(',', '.'));
          const hasLimit = Number.isFinite(limitValue) && limitValue > 0;
          const spentValue = spent[category] ?? 0;
          const pct = hasLimit ? Math.min((spentValue / limitValue) * 100, 100) : 0;
          const over = hasLimit && spentValue > limitValue;

          return (
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.category}>{category}</Text>
                <TextInput
                  style={styles.limitInput}
                  keyboardType="decimal-pad"
                  placeholder="Sin límite"
                  value={limits[category] ?? ''}
                  onChangeText={(value) => setLimits((prev) => ({ ...prev, [category]: value }))}
                  onEndEditing={() => handleSaveLimit(category)}
                />
              </View>
              {hasLimit ? (
                <>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${pct}%` }, over && styles.barFillOver]} />
                  </View>
                  <Text style={[styles.spentText, over && styles.overText]}>
                    {formatCurrency(spentValue)} de {formatCurrency(limitValue)} este mes
                    {over ? ' · ¡Límite superado!' : ''}
                  </Text>
                </>
              ) : (
                <Text style={styles.spentText}>Gastado este mes: {formatCurrency(spentValue)}</Text>
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  intro: { fontSize: 13, color: '#666', padding: 16, paddingBottom: 0 },
  listContent: { padding: 16 },
  row: { marginBottom: 20 },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  category: { fontSize: 16, fontWeight: '600' },
  limitInput: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
    width: 120,
    textAlign: 'right',
  },
  barTrack: {
    height: 10,
    backgroundColor: '#eee',
    borderRadius: 5,
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: '#2563eb', borderRadius: 5 },
  barFillOver: { backgroundColor: '#dc2626' },
  spentText: { fontSize: 12, color: '#999', marginTop: 4 },
  overText: { color: '#dc2626', fontWeight: '600' },
});
