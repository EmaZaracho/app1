import * as Notifications from 'expo-notifications';
import type { SqlDatabase } from '../db/sqlDatabase';
import { getRules } from '../db/recurringExpenseRulesRepository';
import { getOccurrencesForMonth } from '../db/recurringExpenseOccurrencesRepository';
import { ensureOccurrencesForMonth } from './recurringOccurrenceGenerator';
import { buildReminderPlan, type ReminderOccurrenceInput } from './recurringReminderPlan';
import { getRemindersEnabled, setRemindersEnabled } from './recurringReminderSettings';
import { toMonthKey, shiftMonthKey, parseMonthKey } from './recurringDateUtils';

export { getRemindersEnabled, setRemindersEnabled } from './recurringReminderSettings';

/**
 * Pide permiso de notificaciones SOLO cuando el usuario activa los
 * recordatorios (nunca al iniciar la app). Devuelve si quedó concedido.
 */
export async function requestReminderPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function cancelAllRecurringReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => typeof n.identifier === 'string' && n.identifier.startsWith('rec-'))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => {}))
  );
}

/**
 * Reconcilia los recordatorios locales con el estado actual de reglas y
 * ocurrencias. Cancela todos los propios y reprograma solo la próxima
 * ocurrencia pending relevante de cada regla (mes actual y siguiente), a las
 * 09:00 locales, 3 días antes y el mismo día. No programa años completos. Si
 * los recordatorios están desactivados, solo cancela.
 */
export async function reconcileReminders(db: SqlDatabase, now: Date = new Date()): Promise<void> {
  await cancelAllRecurringReminders();

  const enabled = await getRemindersEnabled();
  if (!enabled) return;

  const currentMonth = toMonthKey(now);
  const nextMonth = shiftMonthKey(currentMonth, 1);
  for (const mk of [currentMonth, nextMonth]) {
    const { year, month } = parseMonthKey(mk);
    await ensureOccurrencesForMonth(db, year, month);
  }

  const rules = await getRules(db, { activeOnly: true });
  const ruleNameById = new Map(rules.map((r) => [r.id, r.name]));

  const [currentOccs, nextOccs] = await Promise.all([
    getOccurrencesForMonth(db, currentMonth, now),
    getOccurrencesForMonth(db, nextMonth, now),
  ]);

  // Próxima ocurrencia pending por regla (la más cercana no resuelta).
  const nextByRule = new Map<number, ReminderOccurrenceInput>();
  for (const occ of [...currentOccs, ...nextOccs]) {
    if (occ.storedStatus !== 'pending') continue;
    const existing = nextByRule.get(occ.ruleId);
    if (!existing || occ.scheduledDate < existing.scheduledDate) {
      nextByRule.set(occ.ruleId, {
        occurrenceId: occ.id,
        ruleName: ruleNameById.get(occ.ruleId) ?? 'Gasto recurrente',
        scheduledDate: occ.scheduledDate,
        projectedAmount: occ.projectedAmount,
        storedStatus: occ.storedStatus,
      });
    }
  }

  const plan = buildReminderPlan([...nextByRule.values()], now);
  for (const item of plan) {
    await Notifications.scheduleNotificationAsync({
      identifier: item.identifier,
      content: { title: item.title, body: item.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: item.fireDate },
    }).catch(() => {});
  }
}

/** Desactiva los recordatorios y cancela los programados. */
export async function disableReminders(): Promise<void> {
  await setRemindersEnabled(false);
  await cancelAllRecurringReminders();
}
