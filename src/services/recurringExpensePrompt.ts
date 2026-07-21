import { EXPENSE_CATEGORIES } from '../types';
import type { AIFundInfo } from './recurringExpenseTypes';

function fundsBlock(funds: AIFundInfo[]): string {
  if (funds.length === 0) {
    return 'No hay fondos disponibles. Devolvé siempre fund en null y fundAssignmentMode "ask_on_payment".';
  }
  return funds
    .map((f) => {
      const aliases = f.aliases.length > 0 ? ` Alias: ${f.aliases.join(', ')}.` : '';
      return `- ${f.name}.${aliases}`;
    })
    .join('\n');
}

/**
 * Prompt del sistema para interpretar un GASTO RECURRENTE MENSUAL a partir de
 * una frase. Flujo separado del parser de movimientos normales: no comparte
 * reglas ni formato.
 */
export function buildRecurringExpensePrompt(funds: AIFundInfo[], todayIso: string): string {
  return `Sos un asistente que interpreta la descripción de un GASTO RECURRENTE MENSUAL en pesos argentinos (ARS). La fecha de hoy es ${todayIso}.

Respondé EXCLUSIVAMENTE con un JSON de la forma:
{"kind": "recurring_expense", "name": string, "description": string | null, "category": string, "amountMode": "fixed" | "estimated" | "unknown", "amount": number | null, "fundAssignmentMode": "fixed" | "ask_on_payment", "fund": string | null, "dayOfMonth": number, "startDate": "YYYY-MM-DD" | null, "endDate": "YYYY-MM-DD" | null}

Fondos disponibles:
${fundsBlock(funds)}

Categorías válidas (usá exactamente una): ${EXPENSE_CATEGORIES.join(', ')}. Si ninguna encaja, usá "Otros".

Reglas:
- Interpretá SOLO gastos que se repiten UNA VEZ POR MES. Ignorá y no interpretes: ingresos, cuotas, frecuencia semanal, quincenal, anual o "cada X días". Si el texto no describe un gasto mensual, devolvé "dayOfMonth": 0 (se rechazará localmente).
- "dayOfMonth" es el día del mes (1 a 31) en que se debita.
- "amountMode": si el importe es estable usá "fixed"; si dice "aproximadamente", "unos", "más o menos", usá "estimated"; si no se menciona un monto o dice que no lo sabe, usá "unknown" y "amount": null. Nunca inventes un monto.
- "amount": número positivo sin símbolos, o null si amountMode es "unknown".
- "fundAssignmentMode": si menciona un fondo concreto de la lista, usá "fixed" y poné en "fund" el nombre canónico EXACTO de la lista (reconocé alias). Si no menciona fondo o dice que quiere elegirlo al pagar, usá "ask_on_payment" y "fund": null.
- No inventes fondos que no estén en la lista. No crees fondos.
- "name" es un nombre corto del gasto (ej. "Internet", "Netflix").
- "description" es opcional (null si no aporta nada).
- "startDate" y "endDate" en formato YYYY-MM-DD, o null si no se mencionan.
- No guardes nada: solo interpretás.`;
}
