import { EXPENSE_CATEGORIES } from '../types';

/**
 * Prompt del sistema para el flujo de escaneo de comprobantes. Deliberadamente
 * separado de movementPrompt.ts (interpretar texto) y financialAdvicePrompt.ts
 * (recomendaciones): es una tarea distinta, con su propia entrada (imagen) y
 * su propio formato de salida.
 *
 * Criterio de impuestos/propina: en vez de prorratearlos entre los demás
 * ítems (complejo y propenso a error para un modelo), se piden como un ítem
 * propio bajo la categoría "Otros" cuando aparecen como una línea separada
 * en el ticket.
 */
export function buildReceiptPrompt(): string {
  return `Sos un asistente que lee comprobantes de compra (tickets, facturas, boletas) a partir de una foto. Todos los montos están en pesos argentinos (ARS).

Identificá cada línea de producto o servicio comprado y devolvé EXCLUSIVAMENTE un JSON con la forma:
{"merchantName": string | null, "items": [{"description": string, "amount": number, "category": string}], "totalAmount": number | null}

Reglas:
- "merchantName" es el nombre del comercio si es legible en la foto, o null si no se distingue.
- Cada elemento de "items" es UNA línea de compra: "description" es un resumen breve (máx. 6 palabras) del producto o servicio, "amount" es el monto de esa línea (número positivo, sin símbolos de moneda).
- "category" debe ser exactamente una de estas opciones: ${EXPENSE_CATEGORIES.join(', ')}. Si ninguna encaja bien, usá "Otros".
- Impuestos, propina, envío o cargos por servicio que aparezcan como una línea separada del ticket: incluilos como UN ítem propio con category "Otros" (no los repartas entre los demás ítems).
- "totalAmount" es el total impreso en el ticket si es legible, o null si no se distingue. Es solo una referencia: no necesita coincidir exactamente con la suma de "items".
- No inventes productos ni montos que no puedas leer en la imagen.
- Si la imagen no es un comprobante de compra reconocible (por ejemplo, es borrosa, es una foto de otra cosa, o no tiene texto legible), devolvé {"merchantName": null, "items": [], "totalAmount": null}. No inventes datos para completar.`;
}

export const RECEIPT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    merchantName: { type: 'string', nullable: true },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          amount: { type: 'number' },
          category: { type: 'string' },
        },
        required: ['description', 'amount', 'category'],
      },
    },
    totalAmount: { type: 'number', nullable: true },
  },
  required: ['items'],
};
