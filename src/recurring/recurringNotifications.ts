import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import type { SqlDatabase } from '../db/sqlDatabase';
import { getRules } from '../db/recurringExpenseRulesRepository';
import { getOccurrencesForMonth } from '../db/recurringExpenseOccurrencesRepository';
import { ensureOccurrencesForMonth } from './recurringOccurrenceGenerator';
import { buildReminderPlan, type ReminderOccurrenceInput } from './recurringReminderPlan';
import { getRemindersEnabled, setRemindersEnabled } from './recurringReminderSettings';
import { toMonthKey, shiftMonthKey, parseMonthKey } from './recurringDateUtils';

export { getRemindersEnabled, setRemindersEnabled } from './recurringReminderSettings';

const REMINDER_CHANNEL_ID = 'recordatorios';

/**
 * expo-notifications falla al importarse dentro de Expo Go en Android (sus
 * notificaciones push se quitaron de Expo Go). Por eso se carga recién cuando
 * se necesita y nunca en ese entorno: allí los recordatorios quedan
 * desactivados, y en builds reales (APK, development build) funcionan igual.
 */
const IS_ANDROID_EXPO_GO =
  Platform.OS === 'android' && Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let notificationsModule: typeof NotificationsModule | null | undefined;

function getNotifications(): typeof NotificationsModule | null {
  if (notificationsModule === undefined) {
    notificationsModule = IS_ANDROID_EXPO_GO ? null : require('expo-notifications');
  }
  return notificationsModule ?? null;
}

/**
 * Configura cómo se muestran las notificaciones: sin handler, expo-notifications
 * descarta las que llegan con la app en primer plano. En Android crea además
 * un canal propio con importancia alta para que aparezcan como banner.
 */
export async function configureNotifications(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: 'Recordatorios de pagos',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
}

/**
 * Pide permiso de notificaciones SOLO cuando el usuario activa los
 * recordatorios (nunca al iniciar la app). Devuelve si quedó concedido.
 */
export async function requestReminderPermission(): Promise<boolean> {
  const Notifications = getNotifications();
  if (!Notifications) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

async function cancelAllRecurringReminders(): Promise<void> {
  const Notifications = getNotifications();
  if (!Notifications) return;
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
  const Notifications = getNotifications();
  if (!Notifications) return;
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
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: item.fireDate,
        channelId: REMINDER_CHANNEL_ID,
      },
    }).catch((err) => console.warn('No se pudo programar el recordatorio', item.identifier, err));
  }
}

let pendingSync: Promise<void> = Promise.resolve();

/**
 * Reprograma los recordatorios tras un cambio (alta/edición de reglas, pagos,
 * omisiones, apertura de la app). Serializa las llamadas para que dos
 * reconciliaciones no se pisen entre el cancelado y la reprogramación, y nunca
 * lanza: un fallo al notificar no debe romper el flujo que lo disparó.
 */
export function requestReminderSync(db: SqlDatabase): Promise<void> {
  pendingSync = pendingSync
    .then(() => reconcileReminders(db))
    .catch((err) => console.warn('No se pudieron sincronizar los recordatorios', err));
  return pendingSync;
}

/** Desactiva los recordatorios y cancela los programados. */
export async function disableReminders(): Promise<void> {
  await setRemindersEnabled(false);
  await cancelAllRecurringReminders();
}
