import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '../types';
import type { AIFundInfo } from './aiTypes';

/** Schema de respuesta para Gemini, específico del flujo de interpretación de movimientos. */
export const MOVEMENT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['gasto', 'ingreso', 'transferencia'] },
    amount: { type: 'number' },
    category: { type: 'string', nullable: true },
    description: { type: 'string' },
    sourceFund: { type: 'string', nullable: true },
    destinationFund: { type: 'string', nullable: true },
  },
  required: ['type', 'amount', 'description'],
};

function fundsBlock(funds: AIFundInfo[]): string {
  if (funds.length === 0) {
    return 'No hay fondos disponibles. Devolvé siempre sourceFund y destinationFund en null.';
  }
  return funds
    .map((f) => {
      const aliases = f.aliases.length > 0 ? ` Alias: ${f.aliases.join(', ')}.` : '';
      return `- ${f.name}.${aliases}`;
    })
    .join('\n');
}

/**
 * Construye dinámicamente el prompt del sistema incluyendo los fondos activos y
 * sus alias, para que la IA pueda identificar origen/destino. Las reglas son
 * compartidas por DeepSeek y Gemini (no se duplican por proveedor).
 */
export function buildMovementPrompt(funds: AIFundInfo[]): string {
  return `Eres un asistente que extrae datos de un movimiento de dinero a partir de una frase en lenguaje natural, en español o inglés. Todos los montos están en pesos argentinos (ARS).

Responde EXCLUSIVAMENTE con un JSON de la forma:
{"type": "gasto" | "ingreso" | "transferencia", "amount": number, "category": string | null, "description": string, "sourceFund": string | null, "destinationFund": string | null}

Fondos disponibles:
${fundsBlock(funds)}

Reglas de tipo:
- "gasto": la persona pagó o gastó dinero. sourceFund es el fondo utilizado; destinationFund es null.
- "ingreso": la persona cobró o recibió dinero. sourceFund es null; destinationFund es el fondo que recibió el dinero.
- "transferencia": la persona movió dinero entre dos de sus fondos. sourceFund y destinationFund son obligatorios cuando ambos se mencionan claramente; category es null.
- Ante la duda entre gasto e ingreso, usá "gasto".

Reglas de fondos:
- Si el usuario menciona un fondo por nombre o alias, devolvé el nombre canónico EXACTO de la lista (no el alias).
- Si no se especifica el fondo, devolvé null. No adivines.
- No devuelvas fondos que no estén en la lista. No inventes fondos.

Reglas de categoría (solo para gasto e ingreso; en transferencia siempre null):
- Si type es "gasto": una de ${EXPENSE_CATEGORIES.join(', ')}.
- Si type es "ingreso": una de ${INCOME_CATEGORIES.join(', ')}.
- Si ninguna encaja, usá "Otros".

- "amount" es el monto numérico (sin símbolos), siempre positivo.
- "description" es un resumen corto (máx. 6 palabras), en el idioma del texto original.
- Si el texto no describe un movimiento válido o no tiene monto identificable, devolvé {"type": "gasto", "amount": 0, "category": "Otros", "description": "", "sourceFund": null, "destinationFund": null}.`;
}
