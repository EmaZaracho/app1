import { round2 } from '../domain/money';
import type {
  EffectiveOccurrenceStatus,
  MonthlyProjectionSummary,
} from '../types/recurringExpenses';

export interface OccurrenceSummaryInput {
  effectiveStatus: EffectiveOccurrenceStatus;
  projectedAmount: number | null;
  /** Monto real del movimiento vinculado, si está pagada. */
  paidActualAmount: number | null;
}

/**
 * Resumen mensual (todo local, nunca la IA). skipped y cancelled NO participan
 * en proyecciones; los importes desconocidos (projectedAmount null) se cuentan
 * aparte y no se suman.
 */
export function summarizeMonth(occurrences: OccurrenceSummaryInput[]): MonthlyProjectionSummary {
  let paidActualTotal = 0;
  let pendingProjectedKnownTotal = 0;
  let unknownPendingCount = 0;
  let skippedCount = 0;
  let cancelledCount = 0;

  for (const occ of occurrences) {
    switch (occ.effectiveStatus) {
      case 'paid':
        paidActualTotal += occ.paidActualAmount ?? 0;
        break;
      case 'pending':
      case 'overdue':
        if (occ.projectedAmount == null) unknownPendingCount += 1;
        else pendingProjectedKnownTotal += occ.projectedAmount;
        break;
      case 'skipped':
        skippedCount += 1;
        break;
      case 'cancelled':
        cancelledCount += 1;
        break;
    }
  }

  return {
    paidActualTotal: round2(paidActualTotal),
    pendingProjectedKnownTotal: round2(pendingProjectedKnownTotal),
    possibleMonthTotal: round2(paidActualTotal + pendingProjectedKnownTotal),
    unknownPendingCount,
    skippedCount,
    cancelledCount,
  };
}

export interface FundPendingOccurrence {
  scheduledDate: string;
  projectedAmount: number;
}

/**
 * Camina las ocurrencias pendientes conocidas (con fondo fijo) ordenadas por
 * fecha y devuelve la primera fecha en que el saldo proyectado quedaría
 * negativo, o null si no ocurre dentro de la lista.
 */
export function firstNegativeDate(
  realBalance: number,
  pendingKnownByDate: FundPendingOccurrence[]
): string | null {
  const sorted = [...pendingKnownByDate].sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : 1));
  let running = realBalance;
  for (const occ of sorted) {
    running -= occ.projectedAmount;
    if (running < 0) return occ.scheduledDate;
  }
  return null;
}
