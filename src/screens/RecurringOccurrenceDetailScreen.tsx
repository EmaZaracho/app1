import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useDb } from '../db/useDb';
import {
  deleteOccurrence,
  getOccurrenceById,
  rescheduleOccurrence,
  setOccurrenceStatus,
} from '../db/recurringExpenseOccurrencesRepository';
import { deleteOccurrenceAndFollowing } from '../recurring/recurringRuleEditing';
import { getRuleById } from '../db/recurringExpenseRulesRepository';
import { getFundById } from '../db/fundsRepo';
import { getMovementById } from '../db/movementsRepo';
import { OccurrenceStatusBadge } from '../components/OccurrenceStatusBadge';
import { formatCurrency } from '../utils/format';
import { useTheme, type Theme } from '../theme';
import type { RecurringExpenseOccurrence } from '../types/recurringExpenses';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RecurringOccurrenceDetail'>;

export default function RecurringOccurrenceDetailScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const { occurrenceId } = route.params;

  const [occ, setOcc] = useState<RecurringExpenseOccurrence | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [fundName, setFundName] = useState<string | null>(null);
  const [realAmount, setRealAmount] = useState<number | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState('');

  const load = useCallback(async () => {
    const found = await getOccurrenceById(db, occurrenceId);
    if (!found) return;
    setOcc(found);
    setRescheduleValue(found.scheduledDate);
    const rule = await getRuleById(db, found.ruleId);
    setRuleName(rule?.name ?? 'Gasto recurrente');
    if (found.fundId != null) {
      const fund = await getFundById(db, found.fundId);
      setFundName(fund?.name ?? null);
    } else {
      setFundName(null);
    }
    if (found.linkedMovementId != null) {
      const mov = await getMovementById(db, found.linkedMovementId);
      setRealAmount(mov?.amount ?? null);
    } else {
      setRealAmount(null);
    }
  }, [db, occurrenceId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function run(action: () => Promise<void>) {
    try {
      await action();
      await load();
    } catch (err) {
      Alert.alert('No se pudo completar', err instanceof Error ? err.message : 'Error inesperado.');
    }
  }

  if (!occ) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  const canRegister = occ.storedStatus === 'pending';
  const diff = realAmount != null && occ.projectedAmount != null ? realAmount - occ.projectedAmount : null;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{ruleName}</Text>
        <OccurrenceStatusBadge status={occ.effectiveStatus} />
      </View>

      <Row label="Fecha programada" value={occ.scheduledDate} styles={styles} />
      {occ.scheduledDate !== occ.originalScheduledDate ? (
        <Row label="Fecha original" value={occ.originalScheduledDate} styles={styles} />
      ) : null}
      <Row
        label="Monto proyectado"
        value={occ.projectedAmount == null ? 'Importe desconocido' : formatCurrency(occ.projectedAmount)}
        styles={styles}
      />
      <Row label="Categoría" value={occ.category} styles={styles} />
      <Row
        label="Fondo"
        value={
          occ.fundAssignmentMode === 'ask_on_payment' && occ.fundId == null
            ? 'Fondo pendiente de selección'
            : fundName ?? 'Fondo'
        }
        styles={styles}
      />
      {realAmount != null ? (
        <>
          <Row label="Monto real" value={formatCurrency(realAmount)} styles={styles} />
          {diff != null ? (
            <Row
              label="Diferencia"
              value={`${diff > 0 ? '+' : ''}${formatCurrency(diff)}`}
              styles={styles}
            />
          ) : null}
        </>
      ) : null}

      {canRegister ? (
        <Pressable
          style={styles.primaryButton}
          onPress={() => navigation.navigate('RegisterOccurrencePayment', { occurrenceId })}
        >
          <Text style={styles.primaryText}>Registrar gasto</Text>
        </Pressable>
      ) : null}

      {occ.linkedMovementId != null ? (
        <Pressable
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('MovementDetail', { movementId: occ.linkedMovementId! })}
        >
          <Text style={styles.secondaryText}>Ver movimiento vinculado</Text>
        </Pressable>
      ) : null}

      {canRegister ? (
        <>
          <Text style={styles.label}>Reprogramar (AAAA-MM-DD)</Text>
          <View style={styles.rescheduleRow}>
            <TextInput
              style={styles.input}
              value={rescheduleValue}
              onChangeText={setRescheduleValue}
              autoCapitalize="none"
            />
            <Pressable
              style={styles.rescheduleButton}
              onPress={() => run(() => rescheduleOccurrence(db, occurrenceId, rescheduleValue.trim()))}
            >
              <Text style={styles.rescheduleText}>Aplicar</Text>
            </Pressable>
          </View>

          <Pressable style={styles.secondaryButton} onPress={() => run(() => setOccurrenceStatus(db, occurrenceId, 'skipped'))}>
            <Text style={styles.secondaryText}>Omitir este mes</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={() => run(() => setOccurrenceStatus(db, occurrenceId, 'cancelled'))}>
            <Text style={styles.secondaryText}>Cancelar esta ocurrencia</Text>
          </Pressable>
        </>
      ) : null}

      {(occ.storedStatus === 'skipped' || occ.storedStatus === 'cancelled') ? (
        <Pressable style={styles.secondaryButton} onPress={() => run(() => setOccurrenceStatus(db, occurrenceId, 'pending'))}>
          <Text style={styles.secondaryText}>Reactivar (volver a pendiente)</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('RecurringExpenseDetail', { ruleId: occ.ruleId })}>
        <Text style={styles.secondaryText}>Editar la recurrencia</Text>
      </Pressable>

      {occ.storedStatus !== 'paid' ? (
        <Pressable
          style={styles.deleteButton}
          onPress={() =>
            Alert.alert(
              'Eliminar ocurrencia',
              '¿Eliminar solo esta ocurrencia, o también todas las siguientes de esta recurrencia?',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Solo esta',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteOccurrence(db, occurrenceId);
                    navigation.goBack();
                  },
                },
                {
                  text: 'Esta y las siguientes',
                  style: 'destructive',
                  onPress: async () => {
                    await deleteOccurrenceAndFollowing(db, occurrenceId);
                    navigation.goBack();
                  },
                },
              ]
            )
          }
        >
          <Text style={styles.deleteText}>Eliminar ocurrencia</Text>
        </Pressable>
      ) : null}
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
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
    rowLabel: { fontSize: 13, color: theme.textSecondary },
    rowValue: { fontSize: 13, color: theme.text, fontWeight: '600' },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 20, color: theme.text },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
    },
    rescheduleRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    rescheduleButton: { backgroundColor: theme.chipSelectedBg, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
    rescheduleText: { color: theme.chipSelectedText, fontWeight: '700' },
    primaryButton: { backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    primaryText: { color: theme.primaryText, fontWeight: '700', fontSize: 15 },
    secondaryButton: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 10,
    },
    secondaryText: { color: theme.text, fontWeight: '600' },
    deleteButton: { paddingVertical: 14, alignItems: 'center', marginTop: 16 },
    deleteText: { color: theme.danger, fontWeight: '600' },
  });
}
