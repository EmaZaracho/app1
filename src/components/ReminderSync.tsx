import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useDb } from '../db/useDb';
import { configureNotifications, requestReminderSync } from '../recurring/recurringNotifications';

/**
 * Mantiene los recordatorios al día: los reprograma al abrir la app y cada vez
 * que vuelve a primer plano (por ejemplo, al empezar un mes nuevo), ya que solo
 * se programan las ocurrencias del mes actual y el siguiente.
 */
export function ReminderSync() {
  const db = useDb();

  useEffect(() => {
    configureNotifications()
      .catch((err) => console.warn('No se pudieron configurar las notificaciones', err))
      .then(() => requestReminderSync(db));

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') requestReminderSync(db);
    });
    return () => subscription.remove();
  }, [db]);

  return null;
}
