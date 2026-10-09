import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FormScrollView } from '../components/FormScrollView';
import { useDb } from '../db/useDb';
import { getBudgets, getBudgetSpentByCategory, setBudget } from '../db/database';
import { formatCurrency } from '../utils/format';
import { iconForCategory, colorForCategory } from '../categoryVisuals';
import { useTheme, type Theme } from '../theme';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types';
import {
  BUDGET_PERIODS,
  BUDGET_PERIOD_CURRENT,
  BUDGET_PERIOD_LABELS,
  budgetRange,
  toAnchorDate,
  type BudgetPeriod,
} from '../domain/budgetPeriod';
import { formatDayMonthYear, maskDayMonthYear, parseDayMonthYear } from '../domain/periodInput';

interface RowSettings {
  limit: string;
  period: BudgetPeriod;
  /** Fecha de inicio de los ciclos, escrita como dd/mm/aa. */
  anchor: string;
}

function emptySettings(): RowSettings {
  return { limit: '', period: 'monthly', anchor: '' };
}

function emptyAllSettings(): Record<ExpenseCategory, RowSettings> {
  return Object.fromEntries(EXPENSE_CATEGORIES.map((cat) => [cat, emptySettings()])) as Record<
    ExpenseCategory,
    RowSettings
  >;
}

function anchorToText(anchorDate: string | null): string {
  if (!anchorDate) return '';
  const [y, m, d] = anchorDate.split('-').map(Number);
  return formatDayMonthYear(new Date(y, m - 1, d).toISOString());
}

/** Último día incluido del ciclo (el fin del rango es exclusivo). */
function lastDayOfRange(endExclusive: string): string {
  return formatDayMonthYear(new Date(new Date(endExclusive).getTime() - 1).toISOString());
}

export default function BudgetsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const [settings, setSettings] = useState<Record<ExpenseCategory, RowSettings>>(emptyAllSettings);
  const [spent, setSpent] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    const budgets = await getBudgets(db);
    const spentByCategory = await getBudgetSpentByCategory(db, budgets);
    const next = emptyAllSettings();
    for (const budget of budgets) {
      next[budget.category] = {
        limit: String(budget.limit),
        period: budget.period,
        anchor: anchorToText(budget.anchorDate),
      };
    }
    setSettings(next);
    setSpent(Object.fromEntries(spentByCategory));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /** Guarda el presupuesto de la categoría con los valores de la fila; sin límite válido lo borra. */
  async function persist(category: ExpenseCategory, row: RowSettings) {
    const value = Number(row.limit.replace(',', '.'));
    const limit = Number.isFinite(value) && value > 0 ? value : 0;
    const typedAnchor = parseDayMonthYear(row.anchor);
    if (row.period !== 'monthly' && row.anchor && !typedAnchor) {
      // Fecha incompleta o inválida: se descarta la edición y se vuelve a lo guardado.
      await load();
      return;
    }
    const anchorDay = typedAnchor ?? new Date();
    const anchorDate = row.period === 'monthly' ? null : toAnchorDate(anchorDay);
    await setBudget(db, category, limit, row.period, anchorDate);
    setSettings((prev) => ({
      ...prev,
      [category]: {
        limit: limit > 0 ? String(limit) : '',
        period: row.period,
        anchor: anchorToText(anchorDate),
      },
    }));
    const budgets = await getBudgets(db);
    setSpent(Object.fromEntries(await getBudgetSpentByCategory(db, budgets)));
  }

  function updateRow(category: ExpenseCategory, patch: Partial<RowSettings>) {
    setSettings((prev) => ({ ...prev, [category]: { ...prev[category], ...patch } }));
  }

  function selectPeriod(category: ExpenseCategory, period: BudgetPeriod) {
    const row = settings[category];
    const anchor =
      period === 'monthly' ? '' : row.anchor || formatDayMonthYear(new Date().toISOString());
    persist(category, { ...row, period, anchor });
  }

  return (
    <View style={styles.container}>
      <FormScrollView style={styles.container} contentContainerStyle={styles.listContent}>
        <Text style={styles.intro}>
          Definí un límite por categoría, semanal, quincenal o mensual. Los ciclos semanales (7 días) y
          quincenales (15 días) arrancan en la fecha que elijas. Cuando se supere, lo vas a ver marcado
          acá y en el resumen.
        </Text>
        {EXPENSE_CATEGORIES.map((category) => {
          const row = settings[category] ?? emptySettings();
          const limitValue = Number(row.limit.replace(',', '.'));
          const hasLimit = Number.isFinite(limitValue) && limitValue > 0;
          const spentValue = spent[category] ?? 0;
          const pct = hasLimit ? Math.min((spentValue / limitValue) * 100, 100) : 0;
          const over = hasLimit && spentValue > limitValue;
          const categoryColor = colorForCategory(category, theme.scheme);
          const currentLabel = BUDGET_PERIOD_CURRENT[row.period];
          const anchorDay = parseDayMonthYear(row.anchor);
          const range =
            row.period === 'monthly'
              ? null
              : budgetRange(row.period, anchorDay ? toAnchorDate(anchorDay) : null);

          return (
            <View key={category} style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.category}>
                  {iconForCategory(category)} {category}
                </Text>
                <TextInput
                  style={styles.limitInput}
                  keyboardType="decimal-pad"
                  placeholder="Sin límite"
                  placeholderTextColor={theme.textMuted}
                  value={row.limit}
                  onChangeText={(value) => updateRow(category, { limit: value })}
                  onEndEditing={() => persist(category, settings[category])}
                />
              </View>
              <View style={styles.periodRow}>
                {BUDGET_PERIODS.map((period) => {
                  const selected = row.period === period;
                  return (
                    <Pressable
                      key={period}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => selectPeriod(category, period)}
                      style={[styles.periodChip, selected && styles.periodChipSelected]}
                    >
                      <Text style={[styles.periodChipText, selected && styles.periodChipTextSelected]}>
                        {BUDGET_PERIOD_LABELS[period]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {range ? (
                <View style={styles.anchorRow}>
                  <Text style={styles.spentText}>Ciclo desde</Text>
                  <TextInput
                    style={styles.anchorInput}
                    keyboardType="number-pad"
                    placeholder="dd/mm/aa"
                    placeholderTextColor={theme.textMuted}
                    value={row.anchor}
                    onChangeText={(value) => updateRow(category, { anchor: maskDayMonthYear(value) })}
                    onEndEditing={() => persist(category, settings[category])}
                  />
                  <Text style={styles.spentText}>
                    Actual: {formatDayMonthYear(range.start)} – {lastDayOfRange(range.end)}
                  </Text>
                </View>
              ) : null}
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
                    {formatCurrency(spentValue)} de {formatCurrency(limitValue)} {currentLabel}
                    {over ? ' · ¡Límite superado!' : ''}
                  </Text>
                </>
              ) : (
                <Text style={styles.spentText}>
                  Gastado {currentLabel}: {formatCurrency(spentValue)}
                </Text>
              )}
            </View>
          );
        })}
      </FormScrollView>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    intro: { fontSize: 13, color: theme.textSecondary, marginBottom: 16 },
    listContent: { padding: 16 },
    // Cada categoría es una tarjeta: nombre, límite, período y avance quedan dentro de un mismo recuadro.
    row: {
      marginBottom: 12,
      padding: 14,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
    },
    rowHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    category: { fontSize: 16, fontWeight: '600', color: theme.text, flexShrink: 1 },
    limitInput: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      color: theme.text,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
      width: 120,
      flexShrink: 0,
      textAlign: 'right',
    },
    periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    periodChip: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    periodChipSelected: { backgroundColor: theme.chipSelectedBg, borderColor: theme.primary },
    periodChipText: { fontSize: 13, color: theme.textSecondary },
    periodChipTextSelected: { color: theme.chipSelectedText, fontWeight: '600' },
    anchorRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    anchorInput: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      color: theme.text,
      borderRadius: 8,
      paddingHorizontal: 8,
      paddingVertical: 8,
      fontSize: 14,
      width: 104,
      textAlign: 'center',
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
