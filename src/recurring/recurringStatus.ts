import type {
  EffectiveOccurrenceStatus,
  StoredOccurrenceStatus,
} from '../types/recurringExpenses';
import { isBefore } from './recurringDateUtils';

/**
 * Estado efectivo (para mostrar) derivado en tiempo de lectura. overdue NO se
 * persiste: es un pending cuya fecha programada ya pasó respecto de hoy.
 * De esta forma no hace falta actualizar filas a diario para marcar vencidos.
 */
export function computeEffectiveStatus(
  storedStatus: StoredOccurrenceStatus,
  scheduledDate: string,
  today: string
): EffectiveOccurrenceStatus {
  if (storedStatus === 'pending' && isBefore(scheduledDate, today)) {
    return 'overdue';
  }
  return storedStatus;
}
