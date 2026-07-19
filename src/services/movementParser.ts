import type { ApiProvider, ParsedMovement } from '../types';
import { parseMovement as parseWithDeepSeek } from './deepseek';
import { parseMovement as parseWithGemini } from './gemini';

export { MovementParseError } from './parseError';

export async function parseMovementWithProvider(
  text: string,
  provider: ApiProvider,
  apiKey: string
): Promise<ParsedMovement> {
  return provider === 'gemini' ? parseWithGemini(text, apiKey) : parseWithDeepSeek(text, apiKey);
}
