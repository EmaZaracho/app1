import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useDb } from '../db/useDb';
import { getCategoryPriorities, setCategoryPriority } from '../db/categoryFinancialSettingsRepository';
import { clearCachedAdvice } from '../db/financialAdviceCacheRepository';
import { iconForCategory } from '../categoryVisuals';
import { useTheme, type Theme } from '../theme';
import type { SpendingPriority } from '../types/financialAnalytics';
import type { ExpenseCategory } from '../types';

const PRIORITIES: { value: SpendingPriority; label: string; description: string }[] = [
  {
    value: 'essential',
    label: 'Esencial',
    description: 'Gasto difícil de reducir sin afectar necesidades básicas.',
  },
  {
    value: 'flexible',
    label: 'Flexible',
    description: 'Gasto necesario, pero cuyo monto puede optimizarse.',
  },
  {
    value: 'discretionary',
    label: 'Discrecional',
    description: 'Gasto opcional que puede reducirse temporalmente.',
  },
];

export default function CategoryPrioritySettingsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const [items, setItems] = useState<{ category: ExpenseCategory; priority: SpendingPriority }[]>([]);

  const load = useCallback(async () => {
    setItems(await getCategoryPriorities(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleChange(category: ExpenseCategory, priority: SpendingPriority) {
    await setCategoryPriority(db, category, priority);
    // El cambio afecta el próximo análisis: invalida el que esté en caché.
    await clearCachedAdvice(db);
    setItems((prev) => prev.map((i) => (i.category === category ? { ...i, priority } : i)));
  }

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>
        Clasificá tus categorías de gasto. Esto define qué tan agresivas pueden ser las sugerencias de
        reducción en el análisis financiero.
      </Text>
      <FlatList
        data={items}
        keyExtractor={(item) => item.category}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.category}>
              {iconForCategory(item.category)} {item.category}
            </Text>
            <View style={styles.optionsRow}>
              {PRIORITIES.map((p) => (
                <Pressable
                  key={p.value}
                  style={[styles.chip, item.priority === p.value && styles.chipSelected]}
                  onPress={() => handleChange(item.category, p.value)}
                >
                  <Text style={[styles.chipText, item.priority === p.value && styles.chipTextSelected]}>
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.description}>
              {PRIORITIES.find((p) => p.value === item.priority)?.description}
            </Text>
          </View>
        )}
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
    category: { fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 8 },
    optionsRow: { flexDirection: 'row', gap: 8 },
    chip: { borderWidth: 1, borderColor: theme.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
    chipSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
    chipText: { fontSize: 13, color: theme.text },
    chipTextSelected: { color: theme.primaryText, fontWeight: '600' },
    description: { fontSize: 12, color: theme.textMuted, marginTop: 6 },
  });
}
