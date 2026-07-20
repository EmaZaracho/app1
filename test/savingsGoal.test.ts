import { computeSavingsGoalStatus } from '../src/analytics/savingsGoalStatus';
import { validateSavingsGoalValue } from '../src/domain/savingsGoalRules';

describe('meta de ahorro', () => {
  it('validación: valor debe ser finito y mayor a 0', () => {
    expect(validateSavingsGoalValue('fixed_amount', 0)).toBeTruthy();
    expect(validateSavingsGoalValue('fixed_amount', -100)).toBeTruthy();
    expect(validateSavingsGoalValue('fixed_amount', NaN)).toBeTruthy();
    expect(validateSavingsGoalValue('fixed_amount', 1000)).toBeNull();
  });

  it('validación: porcentaje debe estar entre 0 (exclusivo) y 100 (inclusivo)', () => {
    expect(validateSavingsGoalValue('income_percentage', 101)).toBeTruthy();
    expect(validateSavingsGoalValue('income_percentage', 100)).toBeNull();
    expect(validateSavingsGoalValue('income_percentage', 20)).toBeNull();
  });

  it('meta desactivada: no calcula cumplimiento', () => {
    const status = computeSavingsGoalStatus({ enabled: false, mode: 'fixed_amount', targetValue: 1000 }, 500, 2000);
    expect(status.enabled).toBe(false);
    expect(status.targetAmount).toBeNull();
    expect(status.achievementPercentage).toBeNull();
    expect(status.reached).toBeNull();
  });

  it('monto fijo: calcula objetivo, restante y cumplimiento', () => {
    const status = computeSavingsGoalStatus(
      { enabled: true, mode: 'fixed_amount', targetValue: 150000 },
      100000,
      500000
    );
    expect(status.targetAmount).toBe(150000);
    expect(status.remainingAmount).toBe(50000);
    expect(status.achievementPercentage).toBeCloseTo((100000 / 150000) * 100, 1); // redondeado a 2 decimales
    expect(status.reached).toBe(false);
  });

  it('porcentaje de ingresos: objetivo = income * pct / 100', () => {
    const status = computeSavingsGoalStatus(
      { enabled: true, mode: 'income_percentage', targetValue: 20 },
      100000,
      500000
    );
    expect(status.targetAmount).toBe(100000); // 20% de 500000
    expect(status.reached).toBe(true);
    expect(status.remainingAmount).toBe(0);
  });

  it('meta alcanzada: remainingAmount es 0, no negativo', () => {
    const status = computeSavingsGoalStatus({ enabled: true, mode: 'fixed_amount', targetValue: 1000 }, 5000, 10000);
    expect(status.reached).toBe(true);
    expect(status.remainingAmount).toBe(0);
  });
});
