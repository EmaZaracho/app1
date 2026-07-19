import type { ParsedMovement } from '../types';
import { AIProviderError } from './aiErrors';
import { MOVEMENT_SYSTEM_PROMPT } from './movementPrompt';
import { parseMovementResponse } from './parseMovementResponse';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

export async function parseMovement(text: string, apiKey: string): Promise<ParsedMovement> {
  if (!apiKey) {
    throw new AIProviderError('Falta configurar la API key de DeepSeek.');
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
          { role: 'system', content: MOVEMENT_SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      }),
    });
  } catch {
    throw new AIProviderError('No se pudo conectar con DeepSeek. Revisá tu conexión a internet.');
  }

  if (response.status === 401) {
    throw new AIProviderError('API key inválida. Revisala en Configuración.');
  }
  if (!response.ok) {
    throw new AIProviderError(`Error de DeepSeek (${response.status}).`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new AIProviderError('Respuesta inesperada de DeepSeek.');
  }

  return parseMovementResponse(content, text);
}
