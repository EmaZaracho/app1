import type { ParsedMovement } from '../types';
import { MovementParseError } from './parseError';
import { MOVEMENT_SYSTEM_PROMPT, parseMovementJson } from './movementParsing';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';

export async function parseMovement(text: string, apiKey: string): Promise<ParsedMovement> {
  if (!apiKey) {
    throw new MovementParseError('Falta configurar la API key de Gemini.');
  }

  let response: Response;
  try {
    response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: MOVEMENT_SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    });
  } catch (err) {
    throw new MovementParseError('No se pudo conectar con Gemini. Revisá tu conexión a internet.');
  }

  if (!response.ok) {
    if (response.status === 400 || response.status === 403) {
      throw new MovementParseError('API key de Gemini inválida o sin permisos. Revisala en Configuración.');
    }
    let message = `Error de Gemini (${response.status}).`;
    try {
      const errBody = await response.json();
      if (typeof errBody?.error?.message === 'string') message = errBody.error.message;
    } catch {
      // sin cuerpo de error interpretable, se usa el mensaje genérico
    }
    throw new MovementParseError(message);
  }

  const data = await response.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== 'string') {
    throw new MovementParseError('Respuesta inesperada de Gemini.');
  }

  return parseMovementJson(content, text);
}
