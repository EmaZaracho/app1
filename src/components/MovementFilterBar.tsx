import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import type { Category, MovementType } from '../types';

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
  hasAdvancedFilter: boolean;
  filterCategory: Category | null;
  onClearAdvanced: () => void;
}

/** Buscador + chips de tipo (incluye "Ajustes") + chip de filtro avanzado (categoría/período) aplicado desde otra pantalla. */
export function MovementFilterBar({
  visible,
  searchQuery,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  hasAdvancedFilter,
  filterCategory,
  onClearAdvanced,
}: MovementFilterBarProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (!visible) return null;

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
      <View style={styles.typeFilterRow}>
        {TYPE_OPTIONS.map((opt) => (
          <Pressable
            key={opt.label}
            style={[styles.typeChip, filterType === opt.value && styles.typeChipSelected]}
            onPress={() => onFilterTypeChange(opt.value)}
          >
            <Text style={[styles.typeChipText, filterType === opt.value && styles.typeChipTextSelected]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {hasAdvancedFilter ? (
        <Pressable style={styles.advancedFilterChip} onPress={onClearAdvanced}>
          <Text style={styles.advancedFilterText}>
            Filtro de "{filterCategory ?? 'período'}" activo · Tocá para quitarlo ✕
          </Text>
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
    typeFilterRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
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
      paddingVertical: 6,
    },
    typeChipSelected: { backgroundColor: theme.chipSelectedBg, borderColor: theme.chipSelectedBg },
    typeChipText: { fontSize: 13, color: theme.text, fontWeight: '600' },
    typeChipTextSelected: { color: theme.chipSelectedText },
  });
}
