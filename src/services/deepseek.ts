import type { ParsedMovement } from '../types';
import { MovementParseError } from './parseError';
import { MOVEMENT_SYSTEM_PROMPT, parseMovementJson } from './movementParsing';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

export async function parseMovement(text: string, apiKey: string): Promise<ParsedMovement> {
  if (!apiKey) {
    throw new MovementParseError('Falta configurar la API key de DeepSeek.');
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
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: MOVEMENT_SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
    });
  } catch (err) {
    throw new MovementParseError('No se pudo conectar con DeepSeek. Revisá tu conexión a internet.');
  }

  if (response.status === 401) {
    throw new MovementParseError('API key de DeepSeek inválida. Revisala en Configuración.');
  }
  if (!response.ok) {
    let message = `Error de DeepSeek (${response.status}).`;
    try {
      const errBody = await response.json();
      if (typeof errBody?.error?.message === 'string') {
        message = `Error de DeepSeek (${response.status}): ${errBody.error.message}`;
      }
    } catch {
      // sin cuerpo interpretable, se usa el mensaje genérico
    }
    throw new MovementParseError(message);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new MovementParseError('Respuesta inesperada de DeepSeek.');
  }

  return parseMovementJson(content, text);
}
