import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import type { Category, MovementType } from '../types';
import type { MovementPeriodFilter } from '../domain/movementFilters';
import {
  buildPeriodFromInput,
  describePeriod,
  formatDayMonthYear,
  maskDayMonthYear,
} from '../domain/periodInput';

interface TypeOption {
  label: string;
  value: MovementType | null;
}

const TYPE_OPTIONS: readonly TypeOption[] = [
  { label: 'Todos', value: null },
  { label: 'Gastos', value: 'gasto' },
  { label: 'Ingresos', value: 'ingreso' },
  { label: 'Transfer.', value: 'transferencia' },
  { label: 'Ajustes', value: 'ajuste' },
] as const;

interface MovementFilterBarProps {
  visible: boolean;
  searchQuery: string;
  onSearchChange: (v: string) => void;
  filterType: MovementType | null;
  onFilterTypeChange: (v: MovementType | null) => void;
  filterCategory: Category | null;
  onClearCategory: () => void;
  filterPeriod: MovementPeriodFilter | null;
  onFilterPeriodChange: (v: MovementPeriodFilter | null) => void;
}

/**
 * Buscador + chips de tipo (incluye "Ajustes") + selector de período con
 * fechas dd/mm/aa. La categoría solo se aplica desde otra pantalla; acá se
 * muestra como chip para poder quitarla.
 */
export function MovementFilterBar({
  visible,
  searchQuery,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  filterCategory,
  onClearCategory,
  filterPeriod,
  onFilterPeriodChange,
}: MovementFilterBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [periodEditorOpen, setPeriodEditorOpen] = useState(false);
  const [startText, setStartText] = useState('');
  const [endText, setEndText] = useState('');
  const [periodError, setPeriodError] = useState<string | null>(null);
  if (!visible) return null;

  function openPeriodEditor() {
    if (filterPeriod) {
      const lastDay = new Date(filterPeriod.end);
      lastDay.setDate(lastDay.getDate() - 1);
      setStartText(formatDayMonthYear(filterPeriod.start));
      setEndText(formatDayMonthYear(lastDay.toISOString()));
    }
    setPeriodError(null);
    setPeriodEditorOpen(true);
  }

  function applyPeriod() {
    const result = buildPeriodFromInput(startText, endText);
    if (!result.ok) {
      setPeriodError(result.error);
      return;
    }
    onFilterPeriodChange(result.period);
    setPeriodEditorOpen(false);
  }

  function clearPeriod() {
    onFilterPeriodChange(null);
    setStartText('');
    setEndText('');
    setPeriodError(null);
    setPeriodEditorOpen(false);
  }

  const periodChipSelected = filterPeriod !== null || periodEditorOpen;

  return (
    <View style={styles.filterSection}>
      <TextInput
        style={styles.searchInput}
        placeholder="Buscar movimientos..."
        placeholderTextColor={theme.textMuted}
        value={searchQuery}
        onChangeText={onSearchChange}
        returnKeyType="search"
      />
      <ScrollView
        style={styles.typeFilterScroll}
        contentContainerStyle={styles.typeFilterRow}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {TYPE_OPTIONS.map((opt) => (
          <Pressable
            key={opt.label}
            style={[styles.typeChip, filterType === opt.value && styles.typeChipSelected]}
            onPress={() => onFilterTypeChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: filterType === opt.value }}
            accessibilityLabel={`Filtrar por ${opt.label}`}
          >
            <Text
              numberOfLines={1}
              style={[styles.typeChipText, filterType === opt.value && styles.typeChipTextSelected]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.typeChip, periodChipSelected && styles.typeChipSelected]}
          onPress={periodEditorOpen ? () => setPeriodEditorOpen(false) : openPeriodEditor}
          accessibilityRole="button"
          accessibilityState={{ expanded: periodEditorOpen }}
          accessibilityLabel="Elegir período"
        >
          <Text numberOfLines={1} style={[styles.typeChipText, periodChipSelected && styles.typeChipTextSelected]}>
            Período
          </Text>
        </Pressable>
      </ScrollView>

      {periodEditorOpen ? (
        <View style={styles.periodEditor}>
          <View style={styles.periodInputsRow}>
            <View style={styles.periodField}>
              <Text style={styles.periodLabel}>Desde</Text>
              <TextInput
                style={styles.periodInput}
                placeholder="dd/mm/aa"
                placeholderTextColor={theme.textMuted}
                value={startText}
                onChangeText={(v) => setStartText(maskDayMonthYear(v))}
                keyboardType="number-pad"
                maxLength={10}
                accessibilityLabel="Fecha de inicio, formato día, mes y año"
              />
            </View>
            <View style={styles.periodField}>
              <Text style={styles.periodLabel}>Hasta</Text>
              <TextInput
                style={styles.periodInput}
                placeholder="dd/mm/aa"
                placeholderTextColor={theme.textMuted}
                value={endText}
                onChangeText={(v) => setEndText(maskDayMonthYear(v))}
                keyboardType="number-pad"
                maxLength={10}
                returnKeyType="done"
                onSubmitEditing={applyPeriod}
                accessibilityLabel="Fecha de fin, formato día, mes y año"
              />
            </View>
          </View>
          {periodError ? <Text style={styles.periodError}>{periodError}</Text> : null}
          <View style={styles.periodActions}>
            {filterPeriod ? (
              <Pressable style={styles.periodSecondaryButton} onPress={clearPeriod} accessibilityRole="button">
                <Text style={styles.periodSecondaryText}>Quitar</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.periodPrimaryButton} onPress={applyPeriod} accessibilityRole="button">
              <Text style={styles.periodPrimaryText}>Aplicar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {filterPeriod && !periodEditorOpen ? (
        <Pressable style={styles.advancedFilterChip} onPress={clearPeriod} accessibilityRole="button">
          <Text style={styles.advancedFilterText}>Período {describePeriod(filterPeriod)} · Tocá para quitarlo ✕</Text>
        </Pressable>
      ) : null}
      {filterCategory ? (
        <Pressable style={styles.advancedFilterChip} onPress={onClearCategory} accessibilityRole="button">
          <Text style={styles.advancedFilterText}>Categoría "{filterCategory}" · Tocá para quitarla ✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    filterSection: {
      paddingHorizontal: 16,
      paddingTop: 8,
      backgroundColor: theme.bg,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    searchInput: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 8,
      fontSize: 14,
      marginBottom: 10,
    },
    // Fila única desplazable: sin flexWrap, para que "Ajustes" nunca baje a una
    // segunda línea y la lista conserve el alto vertical.
    typeFilterScroll: { flexGrow: 0, marginBottom: 10 },
    typeFilterRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingRight: 4 },
    advancedFilterChip: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 10,
    },
    advancedFilterText: { fontSize: 12, color: theme.primary, fontWeight: '600' },
    typeChip: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexShrink: 0,
    },
    typeChipSelected: { backgroundColor: theme.chipSelectedBg, borderColor: theme.chipSelectedBg },
    typeChipText: { fontSize: 13, color: theme.text, fontWeight: '600' },
    typeChipTextSelected: { color: theme.chipSelectedText },
    periodEditor: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      padding: 12,
      marginBottom: 10,
    },
    periodInputsRow: { flexDirection: 'row', gap: 10 },
    periodField: { flex: 1 },
    periodLabel: { fontSize: 12, color: theme.textSecondary, fontWeight: '600', marginBottom: 4 },
    periodInput: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      color: theme.text,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
    },
    periodError: { fontSize: 12, color: theme.danger, marginTop: 8 },
    periodActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 10 },
    periodPrimaryButton: {
      backgroundColor: theme.primary,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    periodPrimaryText: { color: theme.primaryText, fontSize: 13, fontWeight: '700' },
    periodSecondaryButton: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    periodSecondaryText: { color: theme.text, fontSize: 13, fontWeight: '600' },
  });
}
