import { parseMovement } from './gemini';
import { MovementParseError } from './parseError';

describe('parseMovement (Gemini)', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('throws when no api key is provided', async () => {
    await expect(parseMovement('gasté 100', '')).rejects.toThrow(MovementParseError);
  });

  it('parses a successful response', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    type: 'ingreso',
                    amount: 50000,
                    category: 'Sueldo',
                    description: 'Sueldo',
                  }),
                },
              ],
            },
          },
        ],
      }),
    });
    const result = await parseMovement('cobré el sueldo', 'fake-key');
    expect(result).toEqual({ type: 'ingreso', amount: 50000, category: 'Sueldo', description: 'Sueldo' });
  });

  it('throws a friendly error on 400 (invalid key)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'API key not valid' } }),
    });
    await expect(parseMovement('x', 'bad-key')).rejects.toThrow(MovementParseError);
  });

  it('throws when the network request fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network down'));
    await expect(parseMovement('x', 'fake-key')).rejects.toThrow(MovementParseError);
  });
});
