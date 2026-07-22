import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { FundSelector, type SelectableFund } from './FundSelector';
import { CATEGORY_ICON } from '../categoryVisuals';
import { categoriesForType, type AIMovementType } from '../types';
import type { MovementFormState } from '../hooks/useMovementForm';

const TYPE_LABEL: Record<AIMovementType, string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  transferencia: 'Transfer.',
};

interface MovementFormFieldsProps {
  form: MovementFormState;
  funds: SelectableFund[];
}

/**
 * Campos visuales y de validación del formulario de movimiento, reutilizados
 * por el registro manual, la vista previa de IA y el pago de una ocurrencia
 * recurrente. Presentacional: todo el estado vive en `useMovementForm`.
 */
export function MovementFormFields({ form, funds }: MovementFormFieldsProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const showCategoryChips = form.type !== 'transferencia';
  const showSourceSelector = form.type === 'gasto' || form.type === 'transferencia';
  const showDestSelector = form.type === 'ingreso' || form.type === 'transferencia';
  const sourceLabel = form.type === 'transferencia' ? '¿Desde qué fondo?' : '¿Desde qué fondo se pagó?';
  const destLabel = form.type === 'transferencia' ? '¿Hacia qué fondo?' : '¿A qué fondo ingresó?';

  return (
    <View>
      <View style={styles.typeRow}>
        {form.typeLocked ? (
          <View style={styles.lockedTypeChip}>
            <Text style={styles.lockedTypeText}>{TYPE_LABEL[form.type]}</Text>
          </View>
        ) : (
          (['gasto', 'ingreso', 'transferencia'] as const).map((t) => (
            <Pressable
              key={t}
              style={[styles.typeChip, form.type === t && styles.typeChipSelected]}
              onPress={() => form.setType(t)}
            >
              <Text style={[styles.typeChipText, form.type === t && styles.typeChipTextSelected]}>
                {TYPE_LABEL[t]}
              </Text>
            </Pressable>
          ))
        )}
        <TextInput
          style={styles.amountInput}
          value={form.amountText}
          onChangeText={form.setAmountText}
          keyboardType="decimal-pad"
          placeholder="Monto"
          placeholderTextColor={theme.textMuted}
        />
      </View>

      {showCategoryChips ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {categoriesForType(form.type as 'gasto' | 'ingreso').map((cat) => (
            <Pressable
              key={cat}
              style={[styles.categoryChip, form.category === cat && styles.categoryChipSelected]}
              onPress={() => form.setCategory(cat)}
            >
              <Text style={[styles.categoryChipText, form.category === cat && styles.categoryChipTextSelected]}>
                {CATEGORY_ICON[cat]} {cat}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {form.selection.blockingMessage ? (
        <Text style={styles.blockingText}>{form.selection.blockingMessage}</Text>
      ) : null}

      {showSourceSelector ? (
        <FundSelector
          label={sourceLabel}
          funds={funds}
          selectedId={form.sourceFundId}
          onSelect={form.setSourceFundId}
          excludeId={form.type === 'transferencia' ? form.destinationFundId : null}
          required
        />
      ) : null}

      {showDestSelector ? (
        <FundSelector
          label={destLabel}
          funds={funds}
          selectedId={form.destinationFundId}
          onSelect={form.setDestinationFundId}
          excludeId={form.type === 'transferencia' ? form.sourceFundId : null}
          required
        />
      ) : null}

      <TextInput
        style={styles.descriptionInput}
        value={form.description}
        onChangeText={form.setDescription}
        placeholder="Descripción"
        placeholderTextColor={theme.textMuted}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    typeRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' },
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
    lockedTypeChip: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    lockedTypeText: { fontSize: 13, color: theme.textSecondary, fontWeight: '700' },
    amountInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 16,
      textAlign: 'right',
      fontWeight: '700',
      minWidth: 100,
    },
    categoryRow: { gap: 8, paddingBottom: 8 },
    categoryChip: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    categoryChipSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
    categoryChipText: { fontSize: 13, color: theme.text },
    categoryChipTextSelected: { color: theme.primaryText, fontWeight: '600' },
    blockingText: { color: theme.warningText, fontSize: 13, marginTop: 8 },
    descriptionInput: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      marginTop: 12,
    },
  });
}
