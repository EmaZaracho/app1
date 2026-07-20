import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { formatCurrency } from '../utils/format';
import { validateSavingsGoalValue } from '../domain/savingsGoalRules';
import type { SavingsGoal, SavingsGoalMode, SavingsGoalStatus } from '../types/financialAnalytics';

interface SavingsGoalCardProps {
  goal: SavingsGoal;
  status: SavingsGoalStatus;
  onSave: (goal: SavingsGoal) => Promise<void> | void;
}

export function SavingsGoalCard({ goal, status, onSave }: SavingsGoalCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(goal.enabled);
  const [mode, setMode] = useState<SavingsGoalMode>(goal.mode);
  const [valueText, setValueText] = useState(goal.targetValue ? String(goal.targetValue) : '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) return;
    setEnabled(goal.enabled);
    setMode(goal.mode);
    setValueText(goal.targetValue ? String(goal.targetValue) : '');
  }, [goal, editing]);

  async function handleSave() {
    const value = Number(valueText.replace(',', '.'));
    if (enabled) {
      const validationError = validateSavingsGoalValue(mode, value);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setError(null);
    await onSave({ enabled, mode, targetValue: enabled ? value : goal.targetValue });
    setEditing(false);
  }

  if (!editing) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>🎯 Meta de ahorro</Text>
          <Pressable onPress={() => setEditing(true)}>
            <Text style={styles.editLink}>{goal.enabled ? 'Editar' : 'Configurar'}</Text>
          </Pressable>
        </View>
        {status.enabled ? (
          <>
            <Text style={styles.bigValue}>{formatCurrency(status.currentAmount)}</Text>
            <Text style={styles.subText}>
              de {formatCurrency(status.targetAmount ?? 0)}
              {status.mode === 'income_percentage' ? ` (${goal.targetValue}% de tus ingresos)` : ''}
            </Text>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.min(100, Math.max(0, status.achievementPercentage ?? 0))}%`,
                    backgroundColor: status.reached ? theme.success : theme.primary,
                  },
                ]}
              />
            </View>
            <Text style={styles.subText}>
              {status.reached
                ? '¡Meta alcanzada!'
                : `Te faltan ${formatCurrency(status.remainingAmount ?? 0)} (${(status.achievementPercentage ?? 0).toFixed(0)}%)`}
            </Text>
          </>
        ) : (
          <Text style={styles.subText}>No configuraste una meta de ahorro.</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>🎯 Meta de ahorro</Text>
        <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: theme.primary, false: theme.border }} />
      </View>
      {enabled ? (
        <>
          <View style={styles.modeRow}>
            {(
              [
                { value: 'fixed_amount' as SavingsGoalMode, label: 'Monto fijo' },
                { value: 'income_percentage' as SavingsGoalMode, label: '% de ingresos' },
              ] as const
            ).map((opt) => (
              <Pressable
                key={opt.value}
                style={[styles.modeChip, mode === opt.value && styles.modeChipSelected]}
                onPress={() => setMode(opt.value)}
              >
                <Text style={[styles.modeChipText, mode === opt.value && styles.modeChipTextSelected]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={valueText}
            onChangeText={setValueText}
            keyboardType="decimal-pad"
            placeholder={mode === 'income_percentage' ? 'Ej: 20' : 'Ej: 150000'}
            placeholderTextColor={theme.textMuted}
          />
        </>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <View style={styles.actionsRow}>
        <Pressable style={styles.cancelButton} onPress={() => { setEditing(false); setError(null); }}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </Pressable>
        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveText}>Guardar</Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      padding: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 15, fontWeight: '700', color: theme.text },
    editLink: { color: theme.primary, fontWeight: '600', fontSize: 13 },
    bigValue: { fontSize: 24, fontWeight: '800', color: theme.text, marginTop: 10 },
    subText: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },
    barTrack: { height: 8, backgroundColor: theme.surfaceAlt, borderRadius: 4, marginTop: 8, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 4 },
    modeRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    modeChip: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    modeChipSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
    modeChipText: { fontSize: 13, color: theme.text },
    modeChipTextSelected: { color: theme.primaryText, fontWeight: '600' },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 16,
      marginTop: 10,
    },
    errorText: { color: theme.danger, fontSize: 12, marginTop: 8 },
    actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    cancelButton: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cancelText: { color: theme.textSecondary, fontWeight: '600' },
    saveButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, backgroundColor: theme.primary },
    saveText: { color: theme.primaryText, fontWeight: '700' },
  });
}
