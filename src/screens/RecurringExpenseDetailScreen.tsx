import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useDb } from '../db/useDb';
import {
  deleteRule,
  getRuleById,
  setRuleActive,
} from '../db/recurringExpenseRulesRepository';
import { getOccurrencesForRule } from '../db/recurringExpenseOccurrencesRepository';
import { getFundById } from '../db/fundsRepo';
import { OccurrenceStatusBadge } from '../components/OccurrenceStatusBadge';
import { formatCurrency } from '../utils/format';
import { useTheme, type Theme } from '../theme';
import type { RecurringExpenseOccurrence, RecurringExpenseRule } from '../types/recurringExpenses';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RecurringExpenseDetail'>;

const AMOUNT_MODE_LABEL = { fixed: 'Fijo', estimated: 'Estimado', unknown: 'Desconocido' } as const;

export default function RecurringExpenseDetailScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const { ruleId } = route.params;

  const [rule, setRule] = useState<RecurringExpenseRule | null>(null);
  const [fundName, setFundName] = useState<string | null>(null);
  const [occurrences, setOccurrences] = useState<RecurringExpenseOccurrence[]>([]);

  const load = useCallback(async () => {
    const found = await getRuleById(db, ruleId);
    setRule(found);
    if (found?.fundId != null) {
      const fund = await getFundById(db, found.fundId);
      setFundName(fund?.name ?? null);
    } else {
      setFundName(null);
    }
    setOccurrences(await getOccurrencesForRule(db, ruleId));
  }, [db, ruleId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!rule) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  const paidCount = occurrences.filter((o) => o.storedStatus === 'paid').length;
  const skippedCount = occurrences.filter((o) => o.storedStatus === 'skipped').length;
  const overdueCount = occurrences.filter((o) => o.effectiveStatus === 'overdue').length;

  async function toggleActive() {
    await setRuleActive(db, ruleId, !rule!.isActive);
    await load();
  }

  function confirmDelete() {
    Alert.alert('Eliminar recurrencia', `¿Eliminar "${rule!.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteRule(db, ruleId);
            navigation.goBack();
          } catch (err) {
            Alert.alert('No se puede eliminar', err instanceof Error ? err.message : 'Error inesperado.');
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{rule.name}</Text>
        <Text style={[styles.activeTag, { color: rule.isActive ? theme.success : theme.textMuted }]}>
          {rule.isActive ? 'Activa' : 'Inactiva'}
        </Text>
      </View>

      <Row label="Categoría" value={rule.category} styles={styles} />
      <Row
        label="Monto"
        value={
          rule.amountMode === 'unknown'
            ? 'Importe desconocido'
            : `${formatCurrency(rule.amount ?? 0)} (${AMOUNT_MODE_LABEL[rule.amountMode]})`
        }
        styles={styles}
      />
      <Row
        label="Fondo"
        value={rule.fundAssignmentMode === 'ask_on_payment' ? 'Preguntar al pagar' : fundName ?? 'Fondo'}
        styles={styles}
      />
      <Row label="Día del mes" value={String(rule.dayOfMonth)} styles={styles} />
      <Row label="Inicio" value={rule.startDate} styles={styles} />
      <Row label="Finaliza" value={rule.endDate ?? '—'} styles={styles} />
      <Row label="Pagadas / Omitidas / Vencidas" value={`${paidCount} / ${skippedCount} / ${overdueCount}`} styles={styles} />

      <View style={styles.actions}>
        <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('RecurringExpenseEditor', { ruleId })}>
          <Text style={styles.primaryText}>Editar (toda la serie)</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={toggleActive}>
          <Text style={styles.secondaryText}>{rule.isActive ? 'Desactivar' : 'Activar'}</Text>
        </Pressable>
        <Pressable style={styles.deleteButton} onPress={confirmDelete}>
          <Text style={styles.deleteText}>Eliminar</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>Historial de ocurrencias</Text>
      {occurrences.length === 0 ? (
        <Text style={styles.emptyText}>Todavía no hay ocurrencias generadas.</Text>
      ) : (
        occurrences.map((occ) => (
          <Pressable
            key={occ.id}
            style={styles.occRow}
            onPress={() => navigation.navigate('RecurringOccurrenceDetail', { occurrenceId: occ.id })}
          >
            <View style={styles.flex}>
              <Text style={styles.occDate}>{occ.scheduledDate}</Text>
              <Text style={styles.occAmount}>
                {occ.projectedAmount == null ? 'Importe desconocido' : formatCurrency(occ.projectedAmount)}
              </Text>
            </View>
            <OccurrenceStatusBadge status={occ.effectiveStatus} />
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

function Row({ label, value, styles }: { label: string; value: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg },
    container: { padding: 20, paddingBottom: 48 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    title: { fontSize: 20, fontWeight: '800', color: theme.text, flex: 1 },
    activeTag: { fontSize: 12, fontWeight: '700' },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    rowLabel: { fontSize: 13, color: theme.textSecondary },
    rowValue: { fontSize: 13, color: theme.text, fontWeight: '600' },
    actions: { marginTop: 20, gap: 10 },
    primaryButton: { backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
    primaryText: { color: theme.primaryText, fontWeight: '700' },
    secondaryButton: { borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    secondaryText: { color: theme.text, fontWeight: '600' },
    deleteButton: { paddingVertical: 12, alignItems: 'center' },
    deleteText: { color: theme.danger, fontWeight: '600' },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginTop: 24, marginBottom: 10 },
    emptyText: { color: theme.textMuted, fontSize: 13 },
    occRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    occDate: { fontSize: 14, color: theme.text, fontWeight: '600' },
    occAmount: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  });
}
