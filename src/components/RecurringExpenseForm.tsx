import React, { useMemo, useRef, useState, type RefObject } from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { FundSelector, type SelectableFund } from './FundSelector';
import { CATEGORY_ICON } from '../categoryVisuals';
import { validateRecurringRule } from '../recurring/recurringValidation';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types';
import type {
  FundAssignmentMode,
  RecurringAmountMode,
  RecurringRuleInput,
} from '../types/recurringExpenses';

interface RecurringExpenseFormProps {
  initial: RecurringRuleInput;
  funds: SelectableFund[];
  submitLabel: string;
  onSubmit: (input: RecurringRuleInput) => void;
  saving?: boolean;
  /** Se llama al enfocar cualquier campo de texto, pasando su propio ref (para scroll-into-view del contenedor). */
  onInputFocus?: (ref: RefObject<TextInput | null>) => void;
}

const AMOUNT_MODES: { value: RecurringAmountMode; label: string }[] = [
  { value: 'fixed', label: 'Fijo' },
  { value: 'estimated', label: 'Estimado' },
  { value: 'unknown', label: 'Desconocido' },
];

export function RecurringExpenseForm({
  initial,
  funds,
  submitLabel,
  onSubmit,
  saving,
  onInputFocus,
}: RecurringExpenseFormProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const nameInputRef = useRef<TextInput>(null);
  const descriptionInputRef = useRef<TextInput>(null);
  const amountInputRef = useRef<TextInput>(null);
  const dayInputRef = useRef<TextInput>(null);
  const startDateInputRef = useRef<TextInput>(null);
  const endDateInputRef = useRef<TextInput>(null);

  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [category, setCategory] = useState<ExpenseCategory>(initial.category);
  const [amountMode, setAmountMode] = useState<RecurringAmountMode>(initial.amountMode);
  const [amountText, setAmountText] = useState(initial.amount != null ? String(initial.amount) : '');
  const [fundMode, setFundMode] = useState<FundAssignmentMode>(initial.fundAssignmentMode);
  const [fundId, setFundId] = useState<number | null>(initial.fundId);
  const [dayText, setDayText] = useState(String(initial.dayOfMonth));
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate ?? '');
  const [isActive, setIsActive] = useState(initial.isActive);
  const [error, setError] = useState<string | null>(null);

  function buildInput(): RecurringRuleInput {
    return {
      name: name.trim(),
      description: description.trim() ? description.trim() : null,
      category,
      amountMode,
      amount: amountMode === 'unknown' ? null : Number(amountText.replace(',', '.')),
      fundAssignmentMode: fundMode,
      fundId: fundMode === 'fixed' ? fundId : null,
      dayOfMonth: Number(dayText),
      startDate: startDate.trim(),
      endDate: endDate.trim() ? endDate.trim() : null,
      isActive,
    };
  }

  function handleSubmit() {
    const input = buildInput();
    const validation = validateRecurringRule(input);
    if (validation) {
      setError(validation);
      return;
    }
    setError(null);
    onSubmit(input);
  }

  return (
    <View>
      <Text style={styles.label}>Nombre</Text>
      <TextInput
        ref={nameInputRef}
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Ej: Internet"
        placeholderTextColor={theme.textMuted}
        onFocus={() => onInputFocus?.(nameInputRef)}
      />

      <Text style={styles.label}>Descripción (opcional)</Text>
      <TextInput
        ref={descriptionInputRef}
        style={styles.input}
        value={description}
        onChangeText={setDescription}
        placeholder="Detalle opcional"
        placeholderTextColor={theme.textMuted}
        onFocus={() => onInputFocus?.(descriptionInputRef)}
      />

      <Text style={styles.label}>Categoría</Text>
      <View style={styles.chipsWrap}>
        {EXPENSE_CATEGORIES.map((cat) => (
          <Pressable
            key={cat}
            style={[styles.chip, category === cat && styles.chipSelected]}
            onPress={() => setCategory(cat)}
          >
            <Text style={[styles.chipText, category === cat && styles.chipTextSelected]}>
              {CATEGORY_ICON[cat]} {cat}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Modalidad de monto</Text>
      <View style={styles.chipsRow}>
        {AMOUNT_MODES.map((m) => (
          <Pressable
            key={m.value}
            style={[styles.chip, amountMode === m.value && styles.chipSelected]}
            onPress={() => setAmountMode(m.value)}
          >
            <Text style={[styles.chipText, amountMode === m.value && styles.chipTextSelected]}>
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {amountMode !== 'unknown' ? (
        <TextInput
          ref={amountInputRef}
          style={[styles.input, styles.marginTop]}
          value={amountText}
          onChangeText={setAmountText}
          keyboardType="decimal-pad"
          placeholder="Monto"
          placeholderTextColor={theme.textMuted}
          onFocus={() => onInputFocus?.(amountInputRef)}
        />
      ) : null}

      <Text style={styles.label}>Fondo</Text>
      <View style={styles.chipsRow}>
        {(
          [
            { value: 'fixed' as FundAssignmentMode, label: 'Fondo fijo' },
            { value: 'ask_on_payment' as FundAssignmentMode, label: 'Preguntar al pagar' },
          ] as const
        ).map((m) => (
          <Pressable
            key={m.value}
            style={[styles.chip, fundMode === m.value && styles.chipSelected]}
            onPress={() => setFundMode(m.value)}
          >
            <Text style={[styles.chipText, fundMode === m.value && styles.chipTextSelected]}>
              {m.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {fundMode === 'fixed' ? (
        <FundSelector label="¿Desde qué fondo se paga?" funds={funds} selectedId={fundId} onSelect={setFundId} required />
      ) : null}

      <Text style={styles.label}>Día del mes (1–31)</Text>
      <TextInput
        ref={dayInputRef}
        style={styles.input}
        value={dayText}
        onChangeText={setDayText}
        keyboardType="number-pad"
        placeholder="10"
        placeholderTextColor={theme.textMuted}
        onFocus={() => onInputFocus?.(dayInputRef)}
      />

      <Text style={styles.label}>Fecha de inicio (AAAA-MM-DD)</Text>
      <TextInput
        ref={startDateInputRef}
        style={styles.input}
        value={startDate}
        onChangeText={setStartDate}
        autoCapitalize="none"
        placeholder="2026-08-01"
        placeholderTextColor={theme.textMuted}
        onFocus={() => onInputFocus?.(startDateInputRef)}
      />

      <Text style={styles.label}>Fecha final (opcional)</Text>
      <TextInput
        ref={endDateInputRef}
        style={styles.input}
        value={endDate}
        onChangeText={setEndDate}
        autoCapitalize="none"
        placeholder="AAAA-MM-DD"
        placeholderTextColor={theme.textMuted}
        onFocus={() => onInputFocus?.(endDateInputRef)}
      />

      <View style={styles.switchRow}>
        <Text style={styles.label}>Activa</Text>
        <Switch value={isActive} onValueChange={setIsActive} trackColor={{ true: theme.primary, false: theme.border }} />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable style={[styles.submitButton, saving && styles.disabled]} onPress={handleSubmit} disabled={saving}>
        <Text style={styles.submitText}>{submitLabel}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16, color: theme.text },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
    },
    marginTop: { marginTop: 10 },
    chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chipsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    chip: { borderWidth: 1, borderColor: theme.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
    chipSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
    chipText: { fontSize: 13, color: theme.text },
    chipTextSelected: { color: theme.primaryText, fontWeight: '600' },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    errorText: { color: theme.danger, marginTop: 16 },
    submitButton: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 24,
    },
    disabled: { opacity: 0.6 },
    submitText: { color: theme.primaryText, fontWeight: '700', fontSize: 16 },
  });
}
