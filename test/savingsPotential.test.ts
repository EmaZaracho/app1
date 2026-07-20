import {
  computePotentialSavingsSummary,
  isDemandingMode,
  potentialSavingsForCategory,
  suggestedReductionPercentage,
} from '../src/analytics/savingsPotential';
import type { SavingsGoalStatus } from '../src/types/financialAnalytics';

const NO_GOAL: SavingsGoalStatus = {
  enabled: false,
  mode: null,
  configuredValue: null,
  targetAmount: null,
  currentAmount: 0,
  remainingAmount: null,
  achievementPercentage: null,
  reached: null,
};

describe('ahorro potencial por categoría', () => {
  it('esenciales nunca reciben reducción sugerida', () => {
    expect(suggestedReductionPercentage('essential', false)).toBe(0);
    expect(suggestedReductionPercentage('essential', true)).toBe(0);
    expect(potentialSavingsForCategory(100000, 'essential', true)).toBe(0);
  });

  it('modo normal: flexible 5%, discrecional 10%', () => {
    expect(suggestedReductionPercentage('flexible', false)).toBe(5);
    expect(suggestedReductionPercentage('discretionary', false)).toBe(10);
  });

  it('modo exigente: flexible 10%, discrecional 20%', () => {
    expect(suggestedReductionPercentage('flexible', true)).toBe(10);
    expect(suggestedReductionPercentage('discretionary', true)).toBe(20);
  });

  it('potentialSavingsForCategory = monto * porcentaje / 100', () => {
    expect(potentialSavingsForCategory(10000, 'flexible', false)).toBe(500); // 5%
    expect(potentialSavingsForCategory(10000, 'discretionary', true)).toBe(2000); // 20%
  });

  it('sin gasto no hay ahorro potencial', () => {
    expect(potentialSavingsForCategory(0, 'discretionary', true)).toBe(0);
  });
});

describe('modo exigente (isDemandingMode)', () => {
  const base = {
    operationalSavings: 1000,
    savingsRate: 0.1,
    savingsGoal: NO_GOAL,
    expenseChangePercentage: null as number | null,
    categoryIncreases: [] as { changePercentage: number | null; amount: number }[],
    budgetsExceeded: false,
  };

  it('no exigente por defecto', () => {
    expect(isDemandingMode(base)).toBe(false);
  });

  it('ahorro operativo negativo activa modo exigente', () => {
    expect(isDemandingMode({ ...base, operationalSavings: -100 })).toBe(true);
  });

  it('tasa de ahorro negativa activa modo exigente', () => {
    expect(isDemandingMode({ ...base, savingsRate: -0.05 })).toBe(true);
  });

  it('meta muy por debajo del objetivo (<50%) activa modo exigente', () => {
    const farGoal: SavingsGoalStatus = { ...NO_GOAL, enabled: true, achievementPercentage: 30 };
    expect(isDemandingMode({ ...base, savingsGoal: farGoal })).toBe(true);
  });

  it('meta cerca del objetivo no activa modo exigente por sí sola', () => {
    const closeGoal: SavingsGoalStatus = { ...NO_GOAL, enabled: true, achievementPercentage: 80 };
    expect(isDemandingMode({ ...base, savingsGoal: closeGoal })).toBe(false);
  });

  it('aumento fuerte del gasto total activa modo exigente', () => {
    expect(isDemandingMode({ ...base, expenseChangePercentage: 25 })).toBe(true);
  });

  it('aumento fuerte de una categoría con monto > 0 activa modo exigente', () => {
    expect(
      isDemandingMode({ ...base, categoryIncreases: [{ changePercentage: 30, amount: 5000 }] })
    ).toBe(true);
  });

  it('aumento fuerte de categoría con monto 0 NO activa modo exigente', () => {
    expect(
      isDemandingMode({ ...base, categoryIncreases: [{ changePercentage: 999, amount: 0 }] })
    ).toBe(false);
  });

  it('presupuestos excedidos activa modo exigente', () => {
    expect(isDemandingMode({ ...base, budgetsExceeded: true })).toBe(true);
  });
});

describe('resumen de ahorro potencial', () => {
  it('suma total y proyección, sin garantizar nada', () => {
    const summary = computePotentialSavingsSummary({
      categoryPotentialSavings: [500, 1000, 0],
      operationalSavings: 2000,
      income: 10000,
      savingsGoal: NO_GOAL,
    });
    expect(summary.total).toBe(1500);
    expect(summary.projectedSavingsAfterReductions).toBe(3500);
    expect(summary.projectedSavingsRate).toBeCloseTo(0.35, 5);
    expect(summary.goalWouldBeReached).toBeNull();
  });

  it('indica si la proyección alcanzaría la meta', () => {
    const goal: SavingsGoalStatus = { ...NO_GOAL, enabled: true, targetAmount: 3000 };
    const summary = computePotentialSavingsSummary({
      categoryPotentialSavings: [1500],
      operationalSavings: 2000,
      income: 10000,
      savingsGoal: goal,
    });
    expect(summary.goalWouldBeReached).toBe(true);
  });
});
