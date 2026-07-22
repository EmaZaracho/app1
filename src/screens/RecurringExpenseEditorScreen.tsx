import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useDb } from '../db/useDb';
import { getRuleById, insertRule } from '../db/recurringExpenseRulesRepository';
import { editWholeSeries } from '../recurring/recurringRuleEditing';
import { ensureOccurrencesForMonth } from '../recurring/recurringOccurrenceGenerator';
import { getFundsWithBalances, getFundMatchTargets } from '../db/fundsRepo';
import { getApiKey } from '../services/apiKey';
import { interpretRecurringExpense, AIProviderError } from '../services/recurringExpenseAI';
import { RecurringExpenseForm } from '../components/RecurringExpenseForm';
import { todayLocalDateString, toMonthKey } from '../recurring/recurringDateUtils';
import type { SelectableFund } from '../components/FundSelector';
import { useTheme, type Theme } from '../theme';
import type { RecurringRuleInput } from '../types/recurringExpenses';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RecurringExpenseEditor'>;

function defaultInput(): RecurringRuleInput {
  return {
    name: '',
    description: null,
    category: 'Servicios',
    amountMode: 'fixed',
    amount: null,
    fundAssignmentMode: 'ask_on_payment',
    fundId: null,
    dayOfMonth: 1,
    startDate: todayLocalDateString(),
    endDate: null,
    isActive: true,
  };
}

export default function RecurringExpenseEditorScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const ruleId = route.params?.ruleId;
  const isEdit = ruleId != null;
  const scrollRef = useRef<ScrollView>(null);

  const [funds, setFunds] = useState<SelectableFund[]>([]);
  const [initial, setInitial] = useState<RecurringRuleInput | null>(route.params?.draft ?? null);
  const [formKey, setFormKey] = useState(0);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [hasDeepSeek, setHasDeepSeek] = useState(true);

  useEffect(() => {
    navigation.setOptions({ title: isEdit ? 'Editar recurrencia' : 'Nueva recurrencia' });
  }, [navigation, isEdit]);

  const load = useCallback(async () => {
    const active = await getFundsWithBalances(db, false);
    setFunds(active.map((f) => ({ id: f.id, name: f.name, icon: f.icon, color: f.color })));
    const key = await getApiKey('deepseek');
    setHasDeepSeek(!!key);
    if (isEdit) {
      const rule = await getRuleById(db, ruleId);
      if (rule) {
        setInitial({
          name: rule.name,
          description: rule.description,
          category: rule.category,
          amountMode: rule.amountMode,
          amount: rule.amount,
          fundAssignmentMode: rule.fundAssignmentMode,
          fundId: rule.fundId,
          dayOfMonth: rule.dayOfMonth,
          startDate: rule.startDate,
          endDate: rule.endDate,
          isActive: rule.isActive,
        });
        setFormKey((k) => k + 1);
      }
      setLoading(false);
    } else {
      setInitial((prev) => prev ?? defaultInput());
    }
  }, [db, isEdit, ruleId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleInterpret() {
    if (!aiText.trim()) return;
    const key = await getApiKey('deepseek');
    if (!key) {
      setHasDeepSeek(false);
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const active = await getFundsWithBalances(db, false);
      const aiFunds = active.map((f) => ({ name: f.name, aliases: f.aliases.map((a) => a.alias) }));
      const targets = await getFundMatchTargets(db, true);
      const draft = await interpretRecurringExpense(aiText.trim(), key, aiFunds, targets);
      setInitial(draft);
      setFormKey((k) => k + 1);
      if (draft.fundUnresolved) {
        Alert.alert('Fondo no reconocido', 'No pude identificar el fondo mencionado. Elegilo manualmente.');
      }
    } catch (err) {
      setAiError(err instanceof AIProviderError ? err.message : 'No se pudo interpretar el texto.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit(input: RecurringRuleInput) {
    setSaving(true);
    try {
      if (isEdit) {
        await editWholeSeries(db, ruleId, input, toMonthKey(new Date()));
      } else {
        await insertRule(db, input);
        const now = new Date();
        await ensureOccurrencesForMonth(db, now.getFullYear(), now.getMonth());
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (err) {
      Alert.alert('No se pudo guardar', err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !initial) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {!isEdit ? (
          <View style={styles.aiBox}>
            <Text style={styles.aiTitle}>Crear con DeepSeek</Text>
            {hasDeepSeek ? (
              <>
                <TextInput
                  style={styles.aiInput}
                  value={aiText}
                  onChangeText={setAiText}
                  placeholder='Ej: "Internet se debita el 10 de cada mes por Mercado Pago, unos 25000"'
                  placeholderTextColor={theme.textMuted}
                  multiline
                />
                {aiError ? <Text style={styles.aiError}>{aiError}</Text> : null}
                <Pressable style={styles.aiButton} onPress={handleInterpret} disabled={aiLoading}>
                  {aiLoading ? (
                    <ActivityIndicator color={theme.primaryText} />
                  ) : (
                    <Text style={styles.aiButtonText}>Interpretar</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <Pressable onPress={() => navigation.navigate('MainTabs', { screen: 'SettingsTab' })}>
                <Text style={styles.aiHint}>
                  Necesitás una API key de DeepSeek para esto. Tocá para ir a Configuración. Igual podés cargarlo
                  manualmente abajo.
                </Text>
              </Pressable>
            )}
          </View>
        ) : null}

        <RecurringExpenseForm
          key={formKey}
          initial={initial}
          funds={funds}
          submitLabel={isEdit ? 'Guardar cambios' : 'Crear recurrencia'}
          onSubmit={handleSubmit}
          saving={saving}
          onFocusBottomField={() => scrollRef.current?.scrollToEnd({ animated: true })}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
    container: { padding: 20, paddingBottom: 60 },
    aiBox: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
    },
    aiTitle: { fontSize: 14, fontWeight: '700', color: theme.text },
    aiInput: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      marginTop: 10,
      minHeight: 60,
    },
    aiError: { color: theme.danger, fontSize: 12, marginTop: 8 },
    aiButton: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 10,
      alignItems: 'center',
      marginTop: 10,
    },
    aiButtonText: { color: theme.primaryText, fontWeight: '700' },
    aiHint: { color: theme.textSecondary, fontSize: 13, marginTop: 8, lineHeight: 18 },
  });
}
