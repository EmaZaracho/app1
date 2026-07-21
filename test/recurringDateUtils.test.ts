import { scheduledDateFor, daysInMonth } from '../src/recurring/recurringDateUtils';

describe('recurringDateUtils: fecha efectiva por mes', () => {
  it('día 1', () => {
    expect(scheduledDateFor(2026, 7, 1)).toBe('2026-08-01'); // agosto (month 7)
  });

  it('día 28 existe siempre', () => {
    expect(scheduledDateFor(2027, 1, 28)).toBe('2027-02-28'); // febrero 2027
  });

  it('día 29 en febrero normal usa el 28', () => {
    expect(scheduledDateFor(2027, 1, 29)).toBe('2027-02-28');
  });

  it('día 29 en febrero bisiesto usa el 29', () => {
    expect(scheduledDateFor(2028, 1, 29)).toBe('2028-02-29');
  });

  it('día 30 en febrero usa el último día', () => {
    expect(scheduledDateFor(2027, 1, 30)).toBe('2027-02-28');
    expect(scheduledDateFor(2028, 1, 30)).toBe('2028-02-29');
  });

  it('día 31 en abril usa el 30', () => {
    expect(scheduledDateFor(2026, 3, 31)).toBe('2026-04-30');
  });

  it('día 31 en un mes de 31 lo mantiene', () => {
    expect(scheduledDateFor(2026, 0, 31)).toBe('2026-01-31');
  });

  it('daysInMonth: febrero bisiesto vs normal', () => {
    expect(daysInMonth(2028, 1)).toBe(29);
    expect(daysInMonth(2027, 1)).toBe(28);
    expect(daysInMonth(2026, 3)).toBe(30);
  });
});
