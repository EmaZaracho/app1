import type { FundMatchTarget } from '../domain/fundMatching';
import { todayLocalDateString } from '../recurring/recurringDateUtils';
import { deepseekComplete } from './deepseek';
import { buildRecurringExpensePrompt } from './recurringExpensePrompt';
import {
  parseRecurringExpenseResponse,
  type RecurringExpenseDraft,
} from './parseRecurringExpenseResponse';
import type { AIFundInfo } from './recurringExpenseTypes';

export { AIProviderError } from './aiErrors';
export type { RecurringExpenseDraft } from './parseRecurringExpenseResponse';

/**
 * Interpreta una frase como un borrador de regla recurrente usando DeepSeek.
 * Este flujo es exclusivo de DeepSeek (según el requerimiento). Solo se envían
 * la frase del usuario, las categorías válidas y los fondos activos (nombre +
 * alias): nunca movimientos, saldos, presupuestos ni historial. El borrador
 * NUNCA se guarda automáticamente: el llamador muestra la vista previa editable
 * y guarda solo tras confirmación.
 */
export async function interpretRecurringExpense(
  text: string,
  apiKey: string,
  funds: AIFundInfo[],
  targets: FundMatchTarget[],
  now: Date = new Date()
): Promise<RecurringExpenseDraft> {
  const systemPrompt = buildRecurringExpensePrompt(funds, todayLocalDateString(now));
  const content = await deepseekComplete(systemPrompt, text, apiKey);
  return parseRecurringExpenseResponse(content, targets, now);
}
