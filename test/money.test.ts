import { average, percentChange, round2, safeDivide } from '../src/domain/money';

describe('utilidades de dinero', () => {
  it('round2 redondea a 2 decimales evitando errores de punto flotante', () => {
    expect(round2(1.005)).toBeCloseTo(1.01, 2);
    expect(round2(10)).toBe(10);
    expect(round2(NaN)).toBe(0);
    expect(round2(Infinity)).toBe(0);
  });

  it('safeDivide devuelve null en vez de Infinity/NaN cuando no hay base', () => {
    expect(safeDivide(100, 0)).toBeNull();
    expect(safeDivide(0, 0)).toBeNull();
    expect(safeDivide(50, 200)).toBe(0.25);
  });

  it('average de un array vacío es 0, no NaN', () => {
    expect(average([])).toBe(0);
    expect(average([10, 20, 30])).toBe(20);
  });

  it('percentChange es null cuando no hay base de comparación válida', () => {
    expect(percentChange(100, 0)).toBeNull(); // de 0 a algo: % indefinido
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
  });
});
