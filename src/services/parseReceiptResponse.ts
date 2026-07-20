import { isValidCategoryForType, type ExpenseCategory } from '../types';
import { AIProviderError } from './aiErrors';
import type { ParsedReceipt, ReceiptItem } from './receiptTypes';

const MAX_ITEMS = 40;

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finitePositive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Valida ESTRICTAMENTE la respuesta cruda de Gemini. Nunca confía en
 * JSON.parse a secas. A diferencia de otros parsers del proyecto, un array
 * de items vacío NO es un error: significa "no se pudo leer la factura", un
 * caso legítimo que la UI debe comunicar distinto de un error de red/formato.
 * Ítems puntuales inválidos (sin descripción, monto <= 0) se descartan sin
 * invalidar el resto de la respuesta.
 */
export function parseReceiptResponse(content: string): ParsedReceipt {
  let raw: any;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new AIProviderError('No se pudo interpretar la respuesta de la IA.');
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AIProviderError('Respuesta de la IA con formato inválido.');
  }

  const rawItems = Array.isArray(raw.items) ? raw.items.slice(0, MAX_ITEMS) : [];

  const items: ReceiptItem[] = [];
  for (const rawItem of rawItems) {
    const description = nonEmptyString(rawItem?.description);
    const amount = finitePositive(rawItem?.amount);
    if (!description || amount == null) continue; // ítem puntual inválido: se descarta, no falla todo

    const rawCategory = typeof rawItem?.category === 'string' ? rawItem.category : '';
    const category = (isValidCategoryForType(rawCategory, 'gasto') ? rawCategory : 'Otros') as ExpenseCategory;

    items.push({ description, amount, category });
  }

  return {
    merchantName: nonEmptyString(raw.merchantName),
    items,
    totalAmount: finitePositive(raw.totalAmount),
  };
}
