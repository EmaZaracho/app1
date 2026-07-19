import { isValidCategoryForType, type AIMovementType } from '../types';
import { AIProviderError } from './aiErrors';
import type { AIMovementResponse } from './aiTypes';

const AI_TYPES: AIMovementType[] = ['gasto', 'ingreso', 'transferencia'];

function optionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Valida la forma cruda devuelta por la IA y la normaliza a AIMovementResponse.
 * No resuelve fondos ni confía en ids: eso ocurre localmente después.
 */
export function parseAIMovement(content: string, rawText: string): AIMovementResponse {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new AIProviderError('No se pudo interpretar la respuesta de la IA.');
  }

  const type: AIMovementType = (AI_TYPES as string[]).includes(parsed?.type)
    ? (parsed.type as AIMovementType)
    : 'gasto';

  const amount = Number(parsed?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AIProviderError('No se identificó un monto válido en el texto.');
  }

  let category: string | null = null;
  if (type !== 'transferencia') {
    const rawCategory = typeof parsed?.category === 'string' ? parsed.category : '';
    category = isValidCategoryForType(rawCategory, type) ? rawCategory : 'Otros';
  }

  const description =
    typeof parsed?.description === 'string' && parsed.description.trim()
      ? parsed.description.trim()
      : rawText.trim();

  return {
    type,
    amount,
    category,
    description,
    sourceFund: optionalString(parsed?.sourceFund),
    destinationFund: optionalString(parsed?.destinationFund),
  };
}
