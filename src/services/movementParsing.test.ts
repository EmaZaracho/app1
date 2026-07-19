import { parseMovementJson } from './movementParsing';
import { MovementParseError } from './parseError';

describe('parseMovementJson', () => {
  it('parses a valid gasto payload', () => {
    const result = parseMovementJson(
      JSON.stringify({ type: 'gasto', amount: 1500, category: 'Comida', description: 'Almuerzo' }),
      'gasté 1500 en el almuerzo'
    );
    expect(result).toEqual({ type: 'gasto', amount: 1500, category: 'Comida', description: 'Almuerzo' });
  });

  it('parses a valid ingreso payload', () => {
    const result = parseMovementJson(
      JSON.stringify({ type: 'ingreso', amount: 50000, category: 'Sueldo', description: 'Sueldo' }),
      'cobré el sueldo'
    );
    expect(result.type).toBe('ingreso');
    expect(result.category).toBe('Sueldo');
  });

  it('falls back to Otros when the category does not belong to the resolved type', () => {
    const result = parseMovementJson(
      JSON.stringify({ type: 'gasto', amount: 100, category: 'Sueldo', description: 'x' }),
      'x'
    );
    expect(result.category).toBe('Otros');
  });

  it('defaults to gasto when type is missing or invalid', () => {
    const result = parseMovementJson(JSON.stringify({ amount: 100, category: 'Comida', description: 'x' }), 'x');
    expect(result.type).toBe('gasto');
  });

  it('falls back to the original text when description is missing', () => {
    const result = parseMovementJson(
      JSON.stringify({ type: 'gasto', amount: 100, category: 'Comida' }),
      '  pagué el café  '
    );
    expect(result.description).toBe('pagué el café');
  });

  it('throws when the amount is missing or not positive', () => {
    expect(() =>
      parseMovementJson(JSON.stringify({ type: 'gasto', amount: 0, category: 'Otros', description: '' }), 'x')
    ).toThrow(MovementParseError);
  });

  it('throws when the content is not valid JSON', () => {
    expect(() => parseMovementJson('not json', 'x')).toThrow(MovementParseError);
  });
});
