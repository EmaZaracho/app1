import { computeDeterministicFindings, type FindingsInput } from '../src/analytics/deterministicFindings';
import type { CategoryExpenseInsight, DataQuality, SavingsGoalStatus } from '../src/types/financialAnalytics';

const SUFFICIENT_QUALITY: DataQuality = { movementCount: 20, activeDays: 15, level: 'sufficient', message: null };

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

function category(overrides: Partial<CategoryExpenseInsight> = {}): CategoryExpenseInsight {
  return {
    category: 'Comida',
    priority: 'flexible',
    amount: 1000,
    percentageOfTotalExpenses: 10,
    previousPeriodAmount: 1000,
    previousPeriodChangePercentage: null,
    historicalAverageAmount: 1000,
    historicalAverageChangePercentage: null,
    currentBudget: null,
    budgetUsagePercentage: null,
    suggestedReductionPercentage: 5,
    potentialSavings: 0,
    ...overrides,
  };
}

function baseInput(overrides: Partial<FindingsInput> = {}): FindingsInput {
  return {
    totals: { income: 10000, expense: 5000, operationalSavings: 5000, savingsRate: 0.5 },
    savingsGoal: NO_GOAL,
    categoryExpenses: [],
    dataQuality: SUFFICIENT_QUALITY,
    ...overrides,
  };
}

describe('hallazgos determinísticos', () => {
  it('1. flujo negativo: gastos > ingresos', () => {
    const findings = computeDeterministicFindings(
      baseInput({ totals: { income: 1000, expense: 1500, operationalSavings: -500, savingsRate: -0.5 } })
    );
    expect(findings.some((f) => f.code === 'negative_cash_flow' && f.severity === 'critical')).toBe(true);
  });

  it('2. meta no alcanzada', () => {
    const goal: SavingsGoalStatus = { ...NO_GOAL, enabled: true, remainingAmount: 5000, achievementPercentage: 50, reached: false };
    const findings = computeDeterministicFindings(baseInput({ savingsGoal: goal }));
    expect(findings.some((f) => f.code === 'savings_goal_not_reached')).toBe(true);
  });

  it('3. meta alcanzada', () => {
    const goal: SavingsGoalStatus = { ...NO_GOAL, enabled: true, currentAmount: 6000, targetAmount: 5000, reached: true };
    const findings = computeDeterministicFindings(baseInput({ savingsGoal: goal }));
    expect(findings.some((f) => f.code === 'savings_goal_reached' && f.severity === 'info')).toBe(true);
  });

  it('4. categoría con aumento fuerte (>=25% y monto relevante)', () => {
    const findings = computeDeterministicFindings(
      baseInput({ categoryExpenses: [category({ previousPeriodChangePercentage: 30, amount: 5000 })] })
    );
    expect(findings.some((f) => f.code === 'category_spike' && f.relatedCategory === 'Comida')).toBe(true);
  });

  it('4b. aumento fuerte pero monto trivial no genera finding', () => {
    const findings = computeDeterministicFindings(
      baseInput({ categoryExpenses: [category({ previousPeriodChangePercentage: 500, amount: 10 })] })
    );
    expect(findings.some((f) => f.code === 'category_spike')).toBe(false);
  });

  it('5. categoría muy concentrada (>=40% del gasto)', () => {
    const findings = computeDeterministicFindings(
      baseInput({ categoryExpenses: [category({ percentageOfTotalExpenses: 45 })] })
    );
    expect(findings.some((f) => f.code === 'category_concentration')).toBe(true);
  });

  it('6. presupuesto excedido (solo con currentBudget presente)', () => {
    const findings = computeDeterministicFindings(
      baseInput({
        categoryExpenses: [category({ amount: 1200, currentBudget: 1000, budgetUsagePercentage: 120 })],
      })
    );
    expect(findings.some((f) => f.code === 'budget_exceeded' && f.severity === 'critical')).toBe(true);
  });

  it('7. presupuesto cerca del límite (>=80% y <100%)', () => {
    const findings = computeDeterministicFindings(
      baseInput({
        categoryExpenses: [category({ amount: 850, currentBudget: 1000, budgetUsagePercentage: 85 })],
      })
    );
    expect(findings.some((f) => f.code === 'budget_near_limit' && f.severity === 'warning')).toBe(true);
  });

  it('presupuesto sin currentBudget (período no mensual) no genera finding de presupuesto', () => {
    const findings = computeDeterministicFindings(
      baseInput({ categoryExpenses: [category({ amount: 5000, currentBudget: null, budgetUsagePercentage: null })] })
    );
    expect(findings.some((f) => f.code.startsWith('budget_'))).toBe(false);
  });

  it('8. tasa de ahorro baja (positiva pero < 10%)', () => {
    const findings = computeDeterministicFindings(
      baseInput({ totals: { income: 10000, expense: 9500, operationalSavings: 500, savingsRate: 0.05 } })
    );
    expect(findings.some((f) => f.code === 'low_savings_rate')).toBe(true);
  });

  it('8b. no duplica con flujo negativo (savingsRate negativo no dispara low_savings_rate)', () => {
    const findings = computeDeterministicFindings(
      baseInput({ totals: { income: 1000, expense: 1500, operationalSavings: -500, savingsRate: -0.5 } })
    );
    expect(findings.some((f) => f.code === 'low_savings_rate')).toBe(false);
  });

  it('9. oportunidad de reducción: elige la mejor única, no una por categoría', () => {
    const findings = computeDeterministicFindings(
      baseInput({
        categoryExpenses: [
          category({ category: 'Comida', potentialSavings: 3000, priority: 'flexible' }),
          category({ category: 'Compras', potentialSavings: 5000, priority: 'discretionary' }),
        ],
      })
    );
    const opportunities = findings.filter((f) => f.code === 'reduction_opportunity');
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0].relatedCategory).toBe('Compras');
  });

  it('9b. sin oportunidades significativas no genera finding', () => {
    const findings = computeDeterministicFindings(
      baseInput({ categoryExpenses: [category({ potentialSavings: 100 })] })
    );
    expect(findings.some((f) => f.code === 'reduction_opportunity')).toBe(false);
  });

  it('10. datos insuficientes / limitados', () => {
    const insufficient = computeDeterministicFindings(
      baseInput({ dataQuality: { movementCount: 2, activeDays: 2, level: 'insufficient', message: 'poca data' } })
    );
    expect(insufficient.some((f) => f.code === 'insufficient_data' && f.severity === 'critical')).toBe(true);

    const limited = computeDeterministicFindings(
      baseInput({ dataQuality: { movementCount: 8, activeDays: 5, level: 'limited', message: 'data limitada' } })
    );
    expect(limited.some((f) => f.code === 'limited_data')).toBe(true);
  });

  it('categorías esenciales nunca generan reduction_opportunity aunque tengan potentialSavings > 0', () => {
    // No debería ocurrir en la práctica (potentialSavings de essential siempre es 0),
    // pero el finding filtra explícitamente por priority !== 'essential' como defensa.
    const findings = computeDeterministicFindings(
      baseInput({ categoryExpenses: [category({ priority: 'essential', potentialSavings: 5000 })] })
    );
    expect(findings.some((f) => f.code === 'reduction_opportunity')).toBe(false);
  });
});
