import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDb } from '../db/useDb';
import { getRules } from '../db/recurringExpenseRulesRepository';
import { getOccurrencesForMonth } from '../db/recurringExpenseOccurrencesRepository';
import {
  getBudgetProjections,
  getFundProjections,
  getMonthlyProjection,
} from '../db/recurringExpenseQueries';
import { getFunds } from '../db/fundsRepo';
import { getMovements } from '../db/movementsRepo';
import { ensureOccurrencesForMonth } from '../recurring/recurringOccurrenceGenerator';
import { reconcileOccurrences } from '../recurring/recurringPayment';
import {
  disableReminders,
  getRemindersEnabled,
  reconcileReminders,
  requestReminderPermission,
  setRemindersEnabled,
} from '../recurring/recurringNotifications';
import {
  monthLabel,
  parseMonthKey,
  shiftMonthKey,
  todayLocalDateString,
  toMonthKey,
} from '../recurring/recurringDateUtils';
import { CalendarMonthGrid } from '../components/CalendarMonthGrid';
import { MonthlyProjectionSummary } from '../components/MonthlyProjectionSummary';
import { RecurringExpenseCard, type OccurrencePaymentInfo } from '../components/RecurringExpenseCard';
import { formatCurrency } from '../utils/format';
import { useTheme, type Theme } from '../theme';
import type {
  BudgetProjection,
  FundProjection,
  MonthlyProjectionSummary as Summary,
  RecurringExpenseOccurrence,
  RecurringExpenseRule,
} from '../types/recurringExpenses';
import type { RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ViewMode = 'calendar' | 'agenda';

interface MonthData {
  occurrences: RecurringExpenseOccurrence[];
  summary: Summary;
  fundProjections: FundProjection[];
  budgetProjections: BudgetProjection[];
  ruleNames: Map<number, string>;
  fundNames: Map<number, string>;
  payments: Map<number, OccurrencePaymentInfo>;
}

export default function FinancialCalendarScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const navigation = useNavigation<Nav>();

  const [monthKey, setMonthKey] = useState(() => toMonthKey(new Date()));
  const [view, setView] = useState<ViewMode>('calendar');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [data, setData] = useState<MonthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [remindersEnabled, setRemindersEnabledState] = useState(false);
  const today = todayLocalDateString();

  const load = useCallback(async () => {
    setLoading(true);
    const { year, month } = parseMonthKey(monthKey);
    await ensureOccurrencesForMonth(db, year, month);
    await reconcileOccurrences(db);

    const [occurrences, summary, fundProjections, rules, funds, allMovements] = await Promise.all([
      getOccurrencesForMonth(db, monthKey),
      getMonthlyProjection(db, monthKey),
      getFundProjections(db, monthKey),
      getRules(db, {}),
      getFunds(db, true),
      getMovements(db),
    ]);
    const isCurrentMonth = monthKey === toMonthKey(new Date());
    const budgetProjections = isCurrentMonth ? await getBudgetProjections(db, monthKey) : [];

    const ruleNames = new Map(rules.map((r) => [r.id, r.name]));
    const fundNames = new Map(funds.map((f) => [f.id, f.name]));
    const movementById = new Map(allMovements.map((m) => [m.id, m]));
    const payments = new Map<number, OccurrencePaymentInfo>();
    for (const occ of occurrences) {
      if (occ.linkedMovementId != null) {
        const mov = movementById.get(occ.linkedMovementId);
        if (mov) payments.set(occ.id, { realAmount: mov.amount, paidDate: mov.createdAt.slice(0, 10) });
      }
    }

    setData({ occurrences, summary, fundProjections, budgetProjections, ruleNames, fundNames, payments });
    setRemindersEnabledState(await getRemindersEnabled());
    setLoading(false);
  }, [db, monthKey]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function goMonth(delta: number) {
    setSelectedDate(null);
    setMonthKey((mk) => shiftMonthKey(mk, delta));
  }

  async function handleToggleReminders(value: boolean) {
    if (value) {
      const granted = await requestReminderPermission();
      if (!granted) {
        Alert.alert(
          'Permiso denegado',
          'Para recibir recordatorios habilitá las notificaciones de la app desde la configuración del dispositivo. Podés volver a intentarlo.'
        );
        return;
      }
      await setRemindersEnabled(true);
      setRemindersEnabledState(true);
      try {
        await reconcileReminders(db);
      } catch {
        // En Expo Go las notificaciones locales pueden estar limitadas; no es un error bloqueante.
      }
    } else {
      await disableReminders();
      setRemindersEnabledState(false);
    }
  }

  const daysOccurrences = useMemo(() => {
    if (!data || !selectedDate) return [];
    return data.occurrences.filter((o) => o.scheduledDate === selectedDate);
  }, [data, selectedDate]);

  function renderCard(occ: RecurringExpenseOccurrence) {
    return (
      <RecurringExpenseCard
        key={occ.id}
        occurrence={occ}
        ruleName={data!.ruleNames.get(occ.ruleId) ?? 'Gasto recurrente'}
        fundName={occ.fundId != null ? data!.fundNames.get(occ.fundId) ?? null : null}
        payment={data!.payments.get(occ.id) ?? null}
        onPress={() => navigation.navigate('RecurringOccurrenceDetail', { occurrenceId: occ.id })}
      />
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <View style={styles.segment}>
        {(['calendar', 'agenda'] as const).map((m) => (
          <Pressable
            key={m}
            style={[styles.segmentButton, view === m && styles.segmentActive]}
            onPress={() => setView(m)}
          >
            <Text style={[styles.segmentText, view === m && styles.segmentTextActive]}>
              {m === 'calendar' ? 'Calendario' : 'Agenda'}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.monthNav}>
        <Pressable onPress={() => goMonth(-1)} hitSlop={12}>
          <Text style={styles.monthArrow}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{monthLabel(monthKey)}</Text>
        <Pressable onPress={() => goMonth(1)} hitSlop={12}>
          <Text style={styles.monthArrow}>›</Text>
        </Pressable>
      </View>

      {loading || !data ? (
        <ActivityIndicator style={styles.loader} color={theme.primary} />
      ) : (
        <>
          <MonthlyProjectionSummary summary={data.summary} />

          <View style={styles.actionsRow}>
            <Pressable style={styles.actionButton} onPress={() => navigation.navigate('RecurringExpenseEditor', undefined)}>
              <Text style={styles.actionText}>+ Gasto recurrente</Text>
            </Pressable>
          </View>

          <View style={styles.reminderRow}>
            <Text style={styles.reminderLabel}>Recordatorios (3 días antes y el día, 09:00)</Text>
            <Switch
              value={remindersEnabled}
              onValueChange={handleToggleReminders}
              trackColor={{ true: theme.primary, false: theme.border }}
            />
          </View>

          {view === 'calendar' ? (
            <>
              <View style={styles.calendarCard}>
                <CalendarMonthGrid
                  monthKey={monthKey}
                  occurrences={data.occurrences}
                  today={today}
                  selectedDate={selectedDate}
                  onSelectDay={(d) => setSelectedDate((prev) => (prev === d ? null : d))}
                />
              </View>
              {selectedDate ? (
                <>
                  <Text style={styles.sectionTitle}>{selectedDate}</Text>
                  {daysOccurrences.length === 0 ? (
                    <Text style={styles.emptyText}>Sin gastos previstos este día.</Text>
                  ) : (
                    daysOccurrences.map(renderCard)
                  )}
                </>
              ) : (
                <Text style={styles.hintText}>Tocá un día para ver sus gastos.</Text>
              )}
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Agenda del mes</Text>
              {data.occurrences.length === 0 ? (
                <Text style={styles.emptyText}>No hay gastos recurrentes este mes.</Text>
              ) : (
                data.occurrences.map(renderCard)
              )}
            </>
          )}

          {data.fundProjections.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Saldo proyectado por fondo</Text>
              {data.fundProjections.map((fp) => (
                <View key={fp.fundId} style={styles.projRow}>
                  <Text style={styles.projName}>{fp.fundName}</Text>
                  <Text style={styles.projMeta}>
                    Real {formatCurrency(fp.realBalance)} · Proyectado{' '}
                    <Text style={{ color: fp.projectedBalance < 0 ? theme.danger : theme.text }}>
                      {formatCurrency(fp.projectedBalance)}
                    </Text>
                  </Text>
                  {fp.goesNegativeOn ? (
                    <Text style={styles.negWarn}>⚠️ Quedaría negativo el {fp.goesNegativeOn}.</Text>
                  ) : null}
                </View>
              ))}
            </>
          ) : null}

          {data.budgetProjections.some((b) => b.projectedOverBy > 0) ? (
            <>
              <Text style={styles.sectionTitle}>Presupuestos proyectados</Text>
              {data.budgetProjections
                .filter((b) => b.projectedOverBy > 0)
                .map((b) => (
                  <Text key={b.category} style={styles.budgetWarn}>
                    {b.category}: podrías superar el presupuesto en {formatCurrency(b.projectedOverBy)}.
                  </Text>
                ))}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    container: { padding: 16, paddingBottom: 48 },
    segment: {
      flexDirection: 'row',
      backgroundColor: theme.surfaceAlt,
      borderRadius: 10,
      padding: 3,
    },
    segmentButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
    segmentActive: { backgroundColor: theme.surface },
    segmentText: { fontSize: 14, color: theme.textSecondary, fontWeight: '600' },
    segmentTextActive: { color: theme.text },
    monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 12 },
    monthArrow: { fontSize: 28, color: theme.primary, fontWeight: '700', paddingHorizontal: 12 },
    monthLabel: { fontSize: 17, fontWeight: '700', color: theme.text },
    loader: { marginTop: 40 },
    actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    actionButton: { flex: 1, backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
    actionText: { color: theme.primaryText, fontWeight: '700', fontSize: 14 },
    reminderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
    reminderLabel: { fontSize: 13, color: theme.textSecondary, flex: 1, paddingRight: 12 },
    calendarCard: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 10,
      marginTop: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginTop: 20, marginBottom: 10 },
    hintText: { fontSize: 13, color: theme.textMuted, marginTop: 12, textAlign: 'center' },
    emptyText: { fontSize: 13, color: theme.textMuted },
    projRow: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    projName: { fontSize: 14, fontWeight: '700', color: theme.text },
    projMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },
    negWarn: { fontSize: 12, color: theme.danger, marginTop: 4 },
    budgetWarn: { fontSize: 13, color: theme.warningText, marginBottom: 6 },
  });
}
