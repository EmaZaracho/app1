import type { ParsedMovement } from '../types';
import { AIProviderError } from './aiErrors';
import { MOVEMENT_SYSTEM_PROMPT } from './movementPrompt';
import { parseMovementResponse } from './parseMovementResponse';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['gasto', 'ingreso'] },
    amount: { type: 'number' },
    category: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['type', 'amount', 'category', 'description'],
};

export async function parseMovement(text: string, apiKey: string): Promise<ParsedMovement> {
  if (!apiKey) {
    throw new AIProviderError('Falta configurar la API key de Gemini.');
  }

  let response: Response;
  try {
    response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: MOVEMENT_SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
  } catch {
    throw new AIProviderError('No se pudo conectar con Gemini. Revisá tu conexión a internet.');
  }

  if (response.status === 400 || response.status === 403) {
    throw new AIProviderError('API key inválida. Revisala en Configuración.');
  }
  if (!response.ok) {
    throw new AIProviderError(`Error de Gemini (${response.status}).`);
  }

  const data = await response.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof content !== 'string') {
    throw new AIProviderError('Respuesta inesperada de Gemini.');
  }

  return parseMovementResponse(content, text);
}
