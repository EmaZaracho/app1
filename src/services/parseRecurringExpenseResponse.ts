import { resolveFundReference, type FundMatchTarget } from '../domain/fundMatching';
import { isValidCategoryForType, type ExpenseCategory } from '../types';
import type {
  FundAssignmentMode,
  RecurringAmountMode,
  RecurringRuleInput,
} from '../types/recurringExpenses';
import { validateRecurringRule } from '../recurring/recurringValidation';
import { todayLocalDateString } from '../recurring/recurringDateUtils';
import { AIProviderError } from './aiErrors';

const AMOUNT_MODES: RecurringAmountMode[] = ['fixed', 'estimated', 'unknown'];
const FUND_MODES: FundAssignmentMode[] = ['fixed', 'ask_on_payment'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Borrador validado listo para la vista previa editable (aún sin confirmar). */
export interface RecurringExpenseDraft extends RecurringRuleInput {
  /** true cuando la IA propuso un fondo que no matcheó ningún fondo real. */
  fundUnresolved: boolean;
}

/**
 * Valida ESTRICTAMENTE la respuesta de DeepSeek y la resuelve a un borrador de
 * regla. Nunca confía en JSON.parse a secas ni en un fundId de la IA: el fondo
 * se resuelve localmente contra nombres/alias. Rechaza lo que no sea un gasto
 * mensual válido.
 */
export function parseRecurringExpenseResponse(
  content: string,
  targets: FundMatchTarget[],
  now: Date = new Date()
): RecurringExpenseDraft {
  let raw: any;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new AIProviderError('No se pudo interpretar la respuesta de la IA.');
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AIProviderError('Respuesta de la IA con formato inválido.');
  }
  if (raw.kind !== 'recurring_expense') {
    throw new AIProviderError('El texto no describe un gasto recurrente mensual.');
  }

  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) throw new AIProviderError('No se identificó el nombre del gasto.');

  const dayOfMonth = Number(raw.dayOfMonth);
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new AIProviderError('No se identificó un día del mes válido (¿es un gasto mensual?).');
  }

  const amountMode: RecurringAmountMode = (AMOUNT_MODES as string[]).includes(raw.amountMode)
    ? raw.amountMode
    : 'unknown';
  let amount: number | null = null;
  if (amountMode !== 'unknown') {
    const n = Number(raw.amount);
    amount = Number.isFinite(n) && n > 0 ? n : null;
  }
  // Coherencia: si dijo fixed/estimated pero no hay monto usable, degradar a unknown.
  const effectiveAmountMode: RecurringAmountMode = amountMode !== 'unknown' && amount == null ? 'unknown' : amountMode;

  const category: ExpenseCategory =
    typeof raw.category === 'string' && isValidCategoryForType(raw.category, 'gasto')
      ? raw.category
      : 'Otros';

  let fundAssignmentMode: FundAssignmentMode = (FUND_MODES as string[]).includes(raw.fundAssignmentMode)
    ? raw.fundAssignmentMode
    : 'ask_on_payment';
  let fundId: number | null = null;
  let fundUnresolved = false;
  if (fundAssignmentMode === 'fixed') {
    const result = resolveFundReference(typeof raw.fund === 'string' ? raw.fund : null, targets);
    if (result.status === 'matched') {
      fundId = result.fundId;
    } else {
      // La IA dijo un fondo pero no matchea (o es ambiguo): no inventamos uno.
      fundAssignmentMode = 'ask_on_payment';
      fundUnresolved = true;
    }
  }

  const startDate =
    typeof raw.startDate === 'string' && DATE_RE.test(raw.startDate)
      ? raw.startDate
      : todayLocalDateString(now);
  const endDate = typeof raw.endDate === 'string' && DATE_RE.test(raw.endDate) ? raw.endDate : null;

  const draft: RecurringExpenseDraft = {
    name,
    description: typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : null,
    category,
    amountMode: effectiveAmountMode,
    amount: effectiveAmountMode === 'unknown' ? null : amount,
    fundAssignmentMode,
    fundId,
    dayOfMonth,
    startDate,
    endDate,
    isActive: true,
    fundUnresolved,
  };

  // Validación final de dominio (misma que la creación manual).
  const error = validateRecurringRule(draft);
  if (error) throw new AIProviderError(error);

  return draft;
}
