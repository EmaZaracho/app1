import { AIProviderError } from './aiErrors';

const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/**
 * Pide una completación a Gemini y devuelve el contenido crudo (JSON string).
 * `responseSchema` es específico de cada flujo (interpretar movimientos,
 * generar recomendaciones financieras, etc.) — nunca se comparte un schema
 * fijo entre flujos distintos.
 */
export async function geminiComplete(
  systemPrompt: string,
  userText: string,
  apiKey: string,
  responseSchema: object
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
          responseSchema,
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

/**
 * Igual que geminiComplete, pero adjunta una imagen (base64) al pedido.
 * Función hermana en vez de un parámetro opcional en geminiComplete para no
 * complicar la firma de los flujos que no usan imágenes (movimientos,
 * recomendaciones financieras).
 */
export async function geminiCompleteWithImage(
  systemPrompt: string,
  userText: string,
  imageBase64: string,
  imageMimeType: string,
  apiKey: string,
  responseSchema: object
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
        contents: [
          {
            role: 'user',
            parts: [
              { text: userText },
              { inline_data: { mime_type: imageMimeType, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema,
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
