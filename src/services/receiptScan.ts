import { geminiCompleteWithImage } from './gemini';
import { buildReceiptPrompt, RECEIPT_RESPONSE_SCHEMA } from './receiptPrompt';
import { parseReceiptResponse } from './parseReceiptResponse';
import type { ParsedReceipt } from './receiptTypes';

export { AIProviderError } from './aiErrors';

/**
 * Escanea la foto de un comprobante y devuelve los ítems ya validados.
 * SIEMPRE usa Gemini, sin importar el proveedor de IA activo del usuario:
 * DeepSeek no tiene capacidad de visión, no hay fallback posible. El
 * llamador es responsable de pedir la key de Gemini específicamente
 * (`getApiKey('gemini')`), no la del proveedor seleccionado.
 */
export async function scanReceipt(imageBase64: string, apiKey: string): Promise<ParsedReceipt> {
  const systemPrompt = buildReceiptPrompt();
  const content = await geminiCompleteWithImage(
    systemPrompt,
    'Extraé los datos de este comprobante.',
    imageBase64,
    'image/jpeg',
    apiKey,
    RECEIPT_RESPONSE_SCHEMA
  );
  return parseReceiptResponse(content);
}
