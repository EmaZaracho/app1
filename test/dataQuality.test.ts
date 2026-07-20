import { computeDataQuality } from '../src/analytics/dataQuality';

describe('calidad de datos', () => {
  it('menos de 5 movimientos: insuficiente', () => {
    expect(computeDataQuality(0, 0, 30).level).toBe('insufficient');
    expect(computeDataQuality(4, 4, 30).level).toBe('insufficient');
  });

  it('entre 5 y 14 movimientos: limitada', () => {
    expect(computeDataQuality(5, 5, 30).level).toBe('limited');
    expect(computeDataQuality(14, 14, 30).level).toBe('limited');
  });

  it('15 o más movimientos, bien distribuidos: suficiente', () => {
    expect(computeDataQuality(15, 15, 30).level).toBe('sufficient');
    expect(computeDataQuality(50, 20, 30).level).toBe('sufficient');
  });

  it('movimientos concentrados en pocos días degrada a limitada aunque el conteo sea alto', () => {
    const result = computeDataQuality(20, 1, 30);
    expect(result.level).toBe('limited');
  });

  it('la concentración no degrada períodos cortos (<=7 días)', () => {
    const result = computeDataQuality(20, 2, 7);
    expect(result.level).toBe('sufficient');
  });

  it('sufficient no tiene mensaje; insufficient/limited sí', () => {
    expect(computeDataQuality(20, 20, 30).message).toBeNull();
    expect(computeDataQuality(2, 2, 30).message).toEqual(expect.any(String));
    expect(computeDataQuality(10, 10, 30).message).toEqual(expect.any(String));
  });
});
