import { isValidCategoryForType, type MovementType, type ParsedMovement } from '../types';
import { AIProviderError } from './aiErrors';

export function parseMovementResponse(content: string, rawText: string): ParsedMovement {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AIProviderError('No se pudo interpretar la respuesta de la IA.');
  }

  const amount = Number(parsed.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AIProviderError('No se identificó un monto válido en el texto.');
  }

  const type: MovementType = parsed.type === 'ingreso' ? 'ingreso' : 'gasto';
  const category = isValidCategoryForType(parsed.category, type) ? parsed.category : 'Otros';
  const description = typeof parsed.description === 'string' && parsed.description.trim()
    ? parsed.description.trim()
    : rawText.trim();

  return { type, amount, category, description };
}
