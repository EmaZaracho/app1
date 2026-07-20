import type { AIProvider } from '../types';
import type { FinancialAdviceInput, FinancialAdvice } from '../types/financialAdvice';
import { deepseekComplete } from './deepseek';
import { geminiComplete } from './gemini';
import { buildFinancialAdvicePrompt, FINANCIAL_ADVICE_RESPONSE_SCHEMA } from './financialAdvicePrompt';
import { parseFinancialAdviceResponse } from './parseFinancialAdviceResponse';

export { AIProviderError } from './aiErrors';

/**
 * Genera recomendaciones financieras a partir de un FinancialAdviceInput ya
 * agregado y validado localmente (nunca movimientos individuales, texto
 * original, descripciones, ids ni nombres de fondos). Reutiliza la misma
 * arquitectura de proveedores (DeepSeek/Gemini) que la interpretación de
 * movimientos, pero con su propio prompt y su propio parser — nunca se
 * mezclan las reglas de ambos flujos.
 */
export async function generateFinancialAdvice(
  input: FinancialAdviceInput,
  provider: AIProvider,
  apiKey: string
): Promise<FinancialAdvice> {
  const systemPrompt = buildFinancialAdvicePrompt();
  const userPayload = JSON.stringify(input);
  const content =
    provider === 'gemini'
      ? await geminiComplete(systemPrompt, userPayload, apiKey, FINANCIAL_ADVICE_RESPONSE_SCHEMA)
      : await deepseekComplete(systemPrompt, userPayload, apiKey);
  return parseFinancialAdviceResponse(content, input);
}
