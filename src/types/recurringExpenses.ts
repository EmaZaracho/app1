import type { ExpenseCategory } from '../types';

export type RecurringAmountMode = 'fixed' | 'estimated' | 'unknown';

export type FundAssignmentMode = 'fixed' | 'ask_on_payment';

export type StoredOccurrenceStatus = 'pending' | 'paid' | 'skipped' | 'cancelled';

/** overdue es un estado VISUAL derivado en lectura (nunca se persiste). */
export type EffectiveOccurrenceStatus = StoredOccurrenceStatus | 'overdue';

export interface RecurringExpenseRule {
  id: number;
  name: string;
  description: string | null;
  category: ExpenseCategory;
  amountMode: RecurringAmountMode;
  amount: number | null;
  fundAssignmentMode: FundAssignmentMode;
  fundId: number | null;
  dayOfMonth: number;
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringExpenseOccurrence {
  id: number;
  ruleId: number;
  occurrenceMonth: string; // YYYY-MM
  originalScheduledDate: string; // YYYY-MM-DD
  scheduledDate: string; // YYYY-MM-DD
  projectedAmount: number | null;
  category: ExpenseCategory;
  fundAssignmentMode: FundAssignmentMode;
  fundId: number | null;
  storedStatus: StoredOccurrenceStatus;
  effectiveStatus: EffectiveOccurrenceStatus;
  linkedMovementId: number | null;
  isManuallyModified: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Datos para crear/editar una regla (sin id ni timestamps). */
export interface RecurringRuleInput {
  name: string;
  description: string | null;
  category: ExpenseCategory;
  amountMode: RecurringAmountMode;
  amount: number | null;
  fundAssignmentMode: FundAssignmentMode;
  fundId: number | null;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}

/** Alcance de una edición hecha desde una ocurrencia. */
export type EditScope = 'only_this' | 'this_and_following' | 'whole_series';

// --- Proyecciones ---------------------------------------------------------

export interface MonthlyProjectionSummary {
  paidActualTotal: number;
  pendingProjectedKnownTotal: number;
  possibleMonthTotal: number;
  unknownPendingCount: number;
  skippedCount: number;
  cancelledCount: number;
}

export interface FundProjection {
  fundId: number;
  fundName: string;
  realBalance: number;
  pendingKnownExpenses: number;
  projectedBalance: number;
  /** Fecha (YYYY-MM-DD) del primer día del mes en que el saldo proyectado queda negativo, o null. */
  goesNegativeOn: string | null;
}

export interface BudgetProjection {
  category: ExpenseCategory;
  spent: number;
  projectedPending: number;
  possibleTotal: number;
  budget: number;
  /** Cuánto se superaría el presupuesto con la proyección (>0 solo si posible total supera el límite). */
  projectedOverBy: number;
}
