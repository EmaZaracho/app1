import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useDb } from '../db/useDb';
import { getBudgets, getCurrentMonthExpenseCategoryTotals, setBudget } from '../db/database';
import { formatCurrency } from '../utils/format';
import { iconForCategory, colorForCategory } from '../categoryVisuals';
import { useTheme, type Theme } from '../theme';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types';

export default function BudgetsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
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
          const categoryColor = colorForCategory(category, theme.scheme);

          return (
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.category}>
                  {iconForCategory(category)} {category}
                </Text>
                <TextInput
                  style={styles.limitInput}
                  keyboardType="decimal-pad"
                  placeholder="Sin límite"
                  placeholderTextColor={theme.textMuted}
                  value={limits[category] ?? ''}
                  onChangeText={(value) => setLimits((prev) => ({ ...prev, [category]: value }))}
                  onEndEditing={() => handleSaveLimit(category)}
                />
              </View>
              {hasLimit ? (
                <>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${pct}%`, backgroundColor: over ? theme.danger : categoryColor },
                      ]}
                    />
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

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    intro: { fontSize: 13, color: theme.textSecondary, padding: 16, paddingBottom: 0 },
    listContent: { padding: 16 },
    row: { marginBottom: 20 },
    rowHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    category: { fontSize: 16, fontWeight: '600', color: theme.text },
    limitInput: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 14,
      width: 120,
      textAlign: 'right',
    },
    barTrack: {
      height: 10,
      backgroundColor: theme.surfaceAlt,
      borderRadius: 5,
      overflow: 'hidden',
    },
    barFill: { height: '100%', borderRadius: 5 },
    spentText: { fontSize: 12, color: theme.textMuted, marginTop: 4 },
    overText: { color: theme.danger, fontWeight: '600' },
  });
}
