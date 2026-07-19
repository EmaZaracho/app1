import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../theme';

export interface SelectableFund {
  id: number;
  name: string;
  icon: string;
  color: string;
}

interface FundSelectorProps {
  label: string;
  funds: SelectableFund[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Oculta este fondo de las opciones (p. ej. el origen al elegir destino). */
  excludeId?: number | null;
  /** Marca visualmente que falta elegir. */
  required?: boolean;
}

/**
 * Selector reutilizable de fondos mediante chips horizontales. Escala a listas
 * largas por el scroll horizontal. Muestra icono, color y nombre.
 */
export function FundSelector({
  label,
  funds,
  selectedId,
  onSelect,
  excludeId,
  required,
}: FundSelectorProps) {
  const theme = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const options = funds.filter((f) => f.id !== excludeId);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && selectedId == null ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {options.map((fund) => {
          const selected = fund.id === selectedId;
          return (
            <Pressable
              key={fund.id}
              style={[
                styles.chip,
                { borderColor: selected ? fund.color : theme.border },
                selected && { backgroundColor: fund.color },
              ]}
              onPress={() => onSelect(fund.id)}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {fund.icon} {fund.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { marginTop: 8 },
    label: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 },
    requiredMark: { color: theme.danger },
    row: { gap: 8, paddingBottom: 4 },
    chip: {
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipText: { fontSize: 13, color: theme.text },
    chipTextSelected: { color: '#fff', fontWeight: '600' },
  });
}
