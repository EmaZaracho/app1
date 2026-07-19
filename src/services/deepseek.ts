import { CATEGORIES, type Category, type ParsedExpense } from '../types';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

const SYSTEM_PROMPT = `Eres un asistente que extrae datos de un gasto a partir de una frase en lenguaje natural, en español o inglés.
Responde EXCLUSIVAMENTE con un JSON de la forma:
{"amount": number, "category": string, "description": string}

Reglas:
- "amount" es el monto numérico del gasto (sin símbolos de moneda), siempre positivo.
- "category" debe ser exactamente una de estas opciones: ${CATEGORIES.join(', ')}. Si no encaja ninguna, usa "Otros".
- "description" es un resumen corto (máx. 6 palabras) de en qué se gastó, en el mismo idioma del texto original.
- Si el texto no describe un gasto válido o no tiene un monto identificable, responde con {"amount": 0, "category": "Otros", "description": ""}.`;

export class DeepSeekError extends Error {}

export async function parseExpense(text: string, apiKey: string): Promise<ParsedExpense> {
  if (!apiKey) {
    throw new DeepSeekError('Falta configurar la API key de DeepSeek.');
  }

  let response: Response;
  try {
    response = await fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
    });
  } catch (err) {
    throw new DeepSeekError('No se pudo conectar con DeepSeek. Revisá tu conexión a internet.');
  }

  if (response.status === 401) {
    throw new DeepSeekError('API key inválida. Revisala en Configuración.');
  }
  if (!response.ok) {
    throw new DeepSeekError(`Error de DeepSeek (${response.status}).`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new DeepSeekError('Respuesta inesperada de DeepSeek.');
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new DeepSeekError('No se pudo interpretar la respuesta de DeepSeek.');
  }

  const amount = Number(parsed.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new DeepSeekError('No se identificó un monto válido en el texto.');
  }

  const category: Category = CATEGORIES.includes(parsed.category) ? parsed.category : 'Otros';
  const description = typeof parsed.description === 'string' && parsed.description.trim()
    ? parsed.description.trim()
    : text.trim();

  return { amount, category, description };
}
