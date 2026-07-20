import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import type { AnalysisPeriodPreset } from '../types/financialAnalytics';

const PRESETS: { value: AnalysisPeriodPreset; label: string }[] = [
  { value: 'current_month', label: 'Este mes' },
  { value: 'previous_month', label: 'Mes anterior' },
  { value: 'last_30_days', label: 'Últimos 30 días' },
  { value: 'last_3_months', label: 'Últimos 3 meses' },
  { value: 'last_6_months', label: 'Últimos 6 meses' },
  { value: 'custom', label: 'Personalizado' },
];

interface PeriodSelectorProps {
  preset: AnalysisPeriodPreset;
  onSelectPreset: (preset: AnalysisPeriodPreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
  customError?: string | null;
}

export function PeriodSelector({
  preset,
  onSelectPreset,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
  customError,
}: PeriodSelectorProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View>
      <View style={styles.row}>
        {PRESETS.map((p) => (
          <Pressable
            key={p.value}
            style={[styles.chip, preset === p.value && styles.chipSelected]}
            onPress={() => onSelectPreset(p.value)}
          >
            <Text style={[styles.chipText, preset === p.value && styles.chipTextSelected]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>
      {preset === 'custom' ? (
        <View style={styles.customRow}>
          <TextInput
            style={styles.dateInput}
            value={customStart}
            onChangeText={onCustomStartChange}
            placeholder="Desde (AAAA-MM-DD)"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
          />
          <TextInput
            style={styles.dateInput}
            value={customEnd}
            onChangeText={onCustomEndChange}
            placeholder="Hasta (AAAA-MM-DD)"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
          />
        </View>
      ) : null}
      {customError ? <Text style={styles.errorText}>{customError}</Text> : null}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipSelected: { backgroundColor: theme.chipSelectedBg, borderColor: theme.chipSelectedBg },
    chipText: { fontSize: 13, color: theme.text, fontWeight: '600' },
    chipTextSelected: { color: theme.chipSelectedText },
    customRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
    dateInput: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
    },
    errorText: { color: theme.danger, fontSize: 12, marginTop: 6 },
  });
}
