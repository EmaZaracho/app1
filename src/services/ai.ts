import type { AIProvider, ParsedMovement } from '../types';
import { parseMovement as parseWithDeepSeek } from './deepseek';
import { parseMovement as parseWithGemini } from './gemini';

export { AIProviderError } from './aiErrors';

export function parseMovement(
  text: string,
  provider: AIProvider,
  apiKey: string
): Promise<ParsedMovement> {
  return provider === 'gemini' ? parseWithGemini(text, apiKey) : parseWithDeepSeek(text, apiKey);
}
