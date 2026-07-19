import { AIProviderError } from './aiErrors';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const RESPONSE_SCHEMA = {
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

/** Pide una completación a Gemini y devuelve el contenido crudo (JSON string). */
export async function geminiComplete(
  systemPrompt: string,
  userText: string,
  apiKey: string
): Promise<string> {
  if (!apiKey) {
    throw new AIProviderError('Falta configurar la API key de Gemini.');
  }

  let response: Response;
  try {
    response = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
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
  return content;
}
