import { formatCurrency, formatSignedCurrency } from './format';

describe('formatCurrency', () => {
  it('formats a positive amount with thousands separators and two decimals', () => {
    expect(formatCurrency(131500)).toBe('$131.500,00');
  });

  it('formats a negative amount with the minus sign before the currency symbol', () => {
    expect(formatCurrency(-500)).toBe('-$500,00');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0,00');
  });
});

describe('formatSignedCurrency', () => {
  it('prefixes income amounts with a plus sign', () => {
    expect(formatSignedCurrency(1000, 'ingreso')).toBe('+$1.000,00');
  });

  it('prefixes expense amounts with a minus sign', () => {
    expect(formatSignedCurrency(1000, 'gasto')).toBe('-$1.000,00');
  });
});
