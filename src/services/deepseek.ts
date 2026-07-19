import { AIProviderError } from './aiErrors';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

/** Pide una completación a DeepSeek y devuelve el contenido crudo (JSON string). */
export async function deepseekComplete(
  systemPrompt: string,
  userText: string,
  apiKey: string
): Promise<string> {
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
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userText },
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
  return content;
}
