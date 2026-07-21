import { formatCurrency } from '../utils/format';
import { parseDateString } from './recurringDateUtils';
import type { StoredOccurrenceStatus } from '../types/recurringExpenses';

export const REMINDER_HOUR = 9; // 09:00 local

export interface ReminderOccurrenceInput {
  occurrenceId: number;
  ruleName: string;
  scheduledDate: string; // YYYY-MM-DD
  projectedAmount: number | null;
  storedStatus: StoredOccurrenceStatus;
}

export interface ReminderPlanItem {
  /** Identificador determinístico para poder cancelarlo sin persistir ids extra. */
  identifier: string;
  fireDate: Date;
  title: string;
  body: string;
}

function localDateAt(dateStr: string, hour: number): Date {
  const { year, month, day } = parseDateString(dateStr);
  return new Date(year, month, day, hour, 0, 0, 0);
}

function bodyFor(ruleName: string, projectedAmount: number | null, daysAhead: number): string {
  const when = daysAhead === 0 ? 'Hoy está previsto el pago' : `${ruleName} se debitará en ${daysAhead} días`;
  const amountPart =
    projectedAmount == null
      ? 'Importe aún desconocido.'
      : `Monto estimado: ${formatCurrency(projectedAmount)}.`;
  return daysAhead === 0 ? `Hoy está previsto el pago de ${ruleName}. ${amountPart}` : `${when}. ${amountPart}`;
}

/**
 * Calcula (de forma pura, sin tocar APIs nativas) los recordatorios a programar
 * para un conjunto de ocurrencias: uno 3 días antes y otro el mismo día, ambos
 * a las 09:00 locales, solo si la fecha de disparo es futura respecto de `now`.
 * Solo se programan ocurrencias pending (las resueltas se cancelan aparte).
 */
export function buildReminderPlan(
  occurrences: ReminderOccurrenceInput[],
  now: Date = new Date()
): ReminderPlanItem[] {
  const plan: ReminderPlanItem[] = [];
  for (const occ of occurrences) {
    if (occ.storedStatus !== 'pending') continue;

    const sameDay = localDateAt(occ.scheduledDate, REMINDER_HOUR);
    const threeDaysBefore = new Date(sameDay);
    threeDaysBefore.setDate(threeDaysBefore.getDate() - 3);

    if (threeDaysBefore.getTime() > now.getTime()) {
      plan.push({
        identifier: `rec-${occ.occurrenceId}-3d`,
        fireDate: threeDaysBefore,
        title: occ.ruleName,
        body: bodyFor(occ.ruleName, occ.projectedAmount, 3),
      });
    }
    if (sameDay.getTime() > now.getTime()) {
      plan.push({
        identifier: `rec-${occ.occurrenceId}-day`,
        fireDate: sameDay,
        title: occ.ruleName,
        body: bodyFor(occ.ruleName, occ.projectedAmount, 0),
      });
    }
  }
  return plan;
}
