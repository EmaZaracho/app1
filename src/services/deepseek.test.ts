import { parseMovement } from './deepseek';
import { MovementParseError } from './parseError';

describe('parseMovement (DeepSeek)', () => {
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
        choices: [
          {
            message: {
              content: JSON.stringify({
                type: 'gasto',
                amount: 100,
                category: 'Comida',
                description: 'Café',
              }),
            },
          },
        ],
      }),
    });
    const result = await parseMovement('pagué 100 en un café', 'fake-key');
    expect(result).toEqual({ type: 'gasto', amount: 100, category: 'Comida', description: 'Café' });
  });

  it('requests a current (non-retired) model name', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ type: 'gasto', amount: 1, category: 'Otros', description: 'x' }) } }],
      }),
    });
    await parseMovement('x', 'fake-key');
    const [, requestInit] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(requestInit.body);
    expect(body.model).not.toBe('deepseek-chat');
    expect(body.model).not.toBe('deepseek-reasoner');
  });

  it('throws a friendly error on 401', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    await expect(parseMovement('x', 'bad-key')).rejects.toThrow(MovementParseError);
  });

  it('surfaces the API error message on other failures', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Model Not Exist' } }),
    });
    await expect(parseMovement('x', 'fake-key')).rejects.toThrow('Model Not Exist');
  });

  it('throws when the network request fails', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network down'));
    await expect(parseMovement('x', 'fake-key')).rejects.toThrow(MovementParseError);
  });
});
