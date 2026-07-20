import type { AIProvider } from '../types';
import type { AIFundInfo, AIMovementResponse } from './aiTypes';
import { deepseekComplete } from './deepseek';
import { geminiComplete } from './gemini';
import { buildMovementPrompt, MOVEMENT_RESPONSE_SCHEMA } from './movementPrompt';
import { parseAIMovement } from './parseMovementResponse';

export { AIProviderError } from './aiErrors';
export type { AIMovementResponse, AIFundInfo } from './aiTypes';
export type { ResolvedAIMovement } from './resolveAIMovement';
export { resolveAIMovement } from './resolveAIMovement';

/**
 * Interpreta una frase en lenguaje natural con el proveedor seleccionado,
 * informándole los fondos activos y sus alias. Devuelve la respuesta EXTERNA
 * validada; la resolución de fondos a ids se hace localmente después.
 */
export async function parseMovement(
  text: string,
  provider: AIProvider,
  apiKey: string,
  funds: AIFundInfo[]
): Promise<AIMovementResponse> {
  const systemPrompt = buildMovementPrompt(funds);
  const content =
    provider === 'gemini'
      ? await geminiComplete(systemPrompt, text, apiKey, MOVEMENT_RESPONSE_SCHEMA)
      : await deepseekComplete(systemPrompt, text, apiKey);
  return parseAIMovement(content, text);
}
