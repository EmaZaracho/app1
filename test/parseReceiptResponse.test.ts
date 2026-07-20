import { parseReceiptResponse } from '../src/services/parseReceiptResponse';
import { AIProviderError } from '../src/services/aiErrors';

describe('parseReceiptResponse', () => {
  it('parsea una respuesta válida con varios ítems', () => {
    const result = parseReceiptResponse(
      JSON.stringify({
        merchantName: 'Supermercado Día',
        items: [
          { description: 'Coca Cola 2L', amount: 1200, category: 'Comida' },
          { description: 'Fideos', amount: 800, category: 'Comida' },
        ],
        totalAmount: 2000,
      })
    );
    expect(result.merchantName).toBe('Supermercado Día');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({ description: 'Coca Cola 2L', amount: 1200, category: 'Comida' });
    expect(result.totalAmount).toBe(2000);
  });

  it('JSON inválido lanza AIProviderError', () => {
    expect(() => parseReceiptResponse('no es json')).toThrow(AIProviderError);
  });

  it('respuesta que no es un objeto lanza AIProviderError', () => {
    expect(() => parseReceiptResponse('[1,2,3]')).toThrow(AIProviderError);
    expect(() => parseReceiptResponse('"solo un string"')).toThrow(AIProviderError);
  });

  it('items vacío NO lanza error: es un resultado válido de "no se pudo leer la factura"', () => {
    const result = parseReceiptResponse(JSON.stringify({ merchantName: null, items: [], totalAmount: null }));
    expect(result.items).toEqual([]);
    expect(result.merchantName).toBeNull();
  });

  it('sin campo items, se interpreta como lista vacía (no falla)', () => {
    const result = parseReceiptResponse(JSON.stringify({ merchantName: null }));
    expect(result.items).toEqual([]);
  });

  it('categoría inexistente cae a "Otros"', () => {
    const result = parseReceiptResponse(
      JSON.stringify({ items: [{ description: 'x', amount: 100, category: 'CategoriaInventada' }] })
    );
    expect(result.items[0].category).toBe('Otros');
  });

  it('ítem con monto <= 0 se descarta sin invalidar el resto', () => {
    const result = parseReceiptResponse(
      JSON.stringify({
        items: [
          { description: 'válido', amount: 500, category: 'Comida' },
          { description: 'inválido', amount: 0, category: 'Comida' },
          { description: 'inválido2', amount: -50, category: 'Comida' },
        ],
      })
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].description).toBe('válido');
  });

  it('ítem sin descripción se descarta', () => {
    const result = parseReceiptResponse(
      JSON.stringify({ items: [{ description: '', amount: 100, category: 'Comida' }] })
    );
    expect(result.items).toHaveLength(0);
  });

  it('trunca a un máximo de 40 ítems', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      description: `item-${i}`,
      amount: 10,
      category: 'Comida',
    }));
    const result = parseReceiptResponse(JSON.stringify({ items }));
    expect(result.items.length).toBeLessThanOrEqual(40);
  });

  it('totalAmount ausente o inválido se devuelve como null (no 0 ni NaN)', () => {
    const result1 = parseReceiptResponse(JSON.stringify({ items: [] }));
    expect(result1.totalAmount).toBeNull();

    const result2 = parseReceiptResponse(JSON.stringify({ items: [], totalAmount: 'no-es-numero' }));
    expect(result2.totalAmount).toBeNull();

    const result3 = parseReceiptResponse(JSON.stringify({ items: [], totalAmount: -5 }));
    expect(result3.totalAmount).toBeNull();
  });

  it('merchantName ausente o vacío se devuelve como null', () => {
    const result1 = parseReceiptResponse(JSON.stringify({ items: [] }));
    expect(result1.merchantName).toBeNull();

    const result2 = parseReceiptResponse(JSON.stringify({ items: [], merchantName: '   ' }));
    expect(result2.merchantName).toBeNull();
  });
});
