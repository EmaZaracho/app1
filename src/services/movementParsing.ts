import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  isValidCategoryForType,
  type MovementType,
  type ParsedMovement,
} from '../types';
import { MovementParseError } from './parseError';

export const MOVEMENT_SYSTEM_PROMPT = `Eres un asistente que extrae datos de un movimiento de dinero a partir de una frase en lenguaje natural, en español o inglés.
Responde EXCLUSIVAMENTE con un JSON de la forma:
{"type": "gasto" | "ingreso", "amount": number, "category": string, "description": string}

Reglas:
- "type" es "ingreso" si la persona cobró o recibió dinero (sueldo, venta, trabajo freelance, un regalo en efectivo, etc.), o "gasto" si pagó o gastó dinero. Ante la duda, usa "gasto".
- "amount" es el monto numérico (sin símbolos de moneda), siempre positivo.
- "category" debe ser exactamente una de estas opciones según "type":
  - Si type es "gasto": ${EXPENSE_CATEGORIES.join(', ')}.
  - Si type es "ingreso": ${INCOME_CATEGORIES.join(', ')}.
  Si ninguna encaja, usa "Otros".
- "description" es un resumen corto (máx. 6 palabras), en el mismo idioma del texto original.
- Si el texto no describe un movimiento válido o no tiene un monto identificable, responde con {"type": "gasto", "amount": 0, "category": "Otros", "description": ""}.`;

export function parseMovementJson(content: string, originalText: string): ParsedMovement {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new MovementParseError('No se pudo interpretar la respuesta del modelo.');
  }

  const amount = Number(parsed.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new MovementParseError('No se identificó un monto válido en el texto.');
  }

  const type: MovementType = parsed.type === 'ingreso' ? 'ingreso' : 'gasto';
  const category = isValidCategoryForType(parsed.category, type) ? parsed.category : 'Otros';
  const description = typeof parsed.description === 'string' && parsed.description.trim()
    ? parsed.description.trim()
    : originalText.trim();

  return { type, amount, category, description };
}
