import type { FundAssignmentMode, RecurringAmountMode } from '../types/recurringExpenses';

/**
 * Forma EXTERNA cruda de la respuesta de DeepSeek para interpretar una regla
 * recurrente. Separada de los tipos internos del dominio: el parser local la
 * valida y recién después resuelve el fondo contra fondos reales.
 */
export interface RecurringExpenseAIResponse {
  kind: 'recurring_expense';
  name: string;
  description: string | null;
  category: string;
  amountMode: RecurringAmountMode;
  amount: number | null;
  fundAssignmentMode: FundAssignmentMode;
  fund: string | null;
  dayOfMonth: number;
  startDate: string | null;
  endDate: string | null;
}

/** Info de fondos activos enviada a la IA (nombre canónico + alias). */
export interface AIFundInfo {
  name: string;
  aliases: string[];
}
