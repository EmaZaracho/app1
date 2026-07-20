import { parseFinancialAdviceResponse } from '../src/services/parseFinancialAdviceResponse';
import { AIProviderError } from '../src/services/aiErrors';
import type { FinancialAdviceInput } from '../src/types/financialAdvice';

function baseInput(): FinancialAdviceInput {
  return {
    period: { preset: 'current_month', start: 'a', end: 'b', days: 31, label: 'Este mes' },
    dataQuality: { movementCount: 20, activeDays: 15, level: 'sufficient', message: null },
    totals: { income: 100000, expense: 60000, operationalSavings: 40000, savingsRate: 0.4, adjustmentsNet: 0 },
    savingsGoal: {
      enabled: false,
      mode: null,
      configuredValue: null,
      targetAmount: null,
      currentAmount: 40000,
      remainingAmount: null,
      achievementPercentage: null,
      reached: null,
    },
    categoryExpenses: [
      {
        category: 'Comida',
        priority: 'flexible',
        amount: 20000,
        percentageOfTotalExpenses: 33.3,
        previousPeriodAmount: 18000,
        previousPeriodChangePercentage: 11.1,
        historicalAverageAmount: 17000,
        historicalAverageChangePercentage: 17.6,
        currentBudget: null,
        budgetUsagePercentage: null,
        suggestedReductionPercentage: 5,
        potentialSavings: 1000,
      },
      {
        category: 'Compras',
        priority: 'discretionary',
        amount: 15000,
        percentageOfTotalExpenses: 25,
        previousPeriodAmount: 10000,
        previousPeriodChangePercentage: 50,
        historicalAverageAmount: 9000,
        historicalAverageChangePercentage: 66.7,
        currentBudget: null,
        budgetUsagePercentage: null,
        suggestedReductionPercentage: 10,
        potentialSavings: 1500,
      },
    ],
    previousPeriod: { income: 90000, expense: 55000, operationalSavings: 35000, savingsRate: 0.39 },
    previousPeriodsAverage: { income: 85000, expense: 50000, operationalSavings: 35000, savingsRate: 0.41 },
    deterministicFindings: [],
    potentialSavings: { total: 2500, projectedSavingsAfterReductions: 42500, projectedSavingsRate: 0.425, goalWouldBeReached: null },
  };
}

function validResponse(overrides: any = {}) {
  return JSON.stringify({
    summary: 'Vas bien este mes.',
    status: 'attention',
    strengths: [{ title: 'Buen ahorro', evidence: 'Ahorraste 40% de tus ingresos.' }],
    recommendations: [
      {
        id: 'ignored-ai-id',
        title: 'Reducí Compras',
        reason: 'Es tu categoría con mayor aumento.',
        action: 'Bajá el gasto en Compras un 10%.',
        priority: 'high',
        relatedCategory: 'Compras',
        suggestedReductionPercentage: 999, // valor incorrecto a propósito
        potentialSavings: 999999, // valor incorrecto a propósito
        timeframe: 'Este mes',
        actionType: 'create_budget',
      },
    ],
    dataQualityMessage: null,
    disclaimer: 'Esto es orientativo, no asesoramiento profesional.',
    ...overrides,
  });
}

describe('parseFinancialAdviceResponse', () => {
  it('acepta una respuesta válida y normaliza el id localmente (nunca confía en el de la IA)', () => {
    const advice = parseFinancialAdviceResponse(validResponse(), baseInput());
    expect(advice.summary).toBe('Vas bien este mes.');
    expect(advice.recommendations).toHaveLength(1);
    expect(advice.recommendations[0].id).not.toBe('ignored-ai-id');
    expect(advice.recommendations[0].id).toBe('rec-1');
  });

  it('reconcilia porcentaje y ahorro potencial contra el valor local exacto de la categoría', () => {
    const advice = parseFinancialAdviceResponse(validResponse(), baseInput());
    const rec = advice.recommendations[0];
    expect(rec.suggestedReductionPercentage).toBe(10); // valor real de "Compras", no 999
    expect(rec.potentialSavings).toBe(1500); // valor real, no 999999
  });

  it('JSON inválido lanza AIProviderError', () => {
    expect(() => parseFinancialAdviceResponse('esto no es json', baseInput())).toThrow(AIProviderError);
  });

  it('respuesta sin summary/disclaimer lanza error', () => {
    expect(() => parseFinancialAdviceResponse(validResponse({ summary: '' }), baseInput())).toThrow(AIProviderError);
    expect(() => parseFinancialAdviceResponse(validResponse({ disclaimer: null }), baseInput())).toThrow(
      AIProviderError
    );
  });

  it('status inválido cae a "attention" en vez de fallar', () => {
    const advice = parseFinancialAdviceResponse(validResponse({ status: 'nonsense' }), baseInput());
    expect(advice.status).toBe('attention');
  });

  it('nunca acepta más de 3 recomendaciones', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      id: `id-${i}`,
      title: `Recomendación ${i}`,
      reason: 'razón',
      action: 'acción',
      priority: 'medium',
      relatedCategory: null,
      timeframe: 'Este mes',
      actionType: 'none',
    }));
    const advice = parseFinancialAdviceResponse(validResponse({ recommendations: many }), baseInput());
    expect(advice.recommendations.length).toBeLessThanOrEqual(3);
  });

  it('descarta una recomendación con categoría inexistente que además reclama números', () => {
    const advice = parseFinancialAdviceResponse(
      validResponse({
        recommendations: [
          {
            id: '1',
            title: 'Categoría inventada',
            reason: 'x',
            action: 'y',
            priority: 'low',
            relatedCategory: 'CategoriaQueNoExiste',
            suggestedReductionPercentage: 15,
            potentialSavings: 500,
            timeframe: 'Este mes',
            actionType: 'none',
          },
        ],
      }),
      baseInput()
    );
    expect(advice.recommendations).toHaveLength(0);
  });

  it('mantiene una recomendación sin categoría si no reclama números verificables', () => {
    const advice = parseFinancialAdviceResponse(
      validResponse({
        recommendations: [
          {
            id: '1',
            title: 'Configurá una meta de ahorro',
            reason: 'No tenés una meta activa.',
            action: 'Definí un monto o porcentaje objetivo.',
            priority: 'medium',
            relatedCategory: null,
            suggestedReductionPercentage: null,
            potentialSavings: null,
            timeframe: 'Este mes',
            actionType: 'configure_savings_goal',
          },
        ],
      }),
      baseInput()
    );
    expect(advice.recommendations).toHaveLength(1);
    expect(advice.recommendations[0].relatedCategory).toBeNull();
  });

  it('descarta una recomendación con priority inválida', () => {
    const advice = parseFinancialAdviceResponse(
      validResponse({
        recommendations: [
          {
            id: '1',
            title: 'x',
            reason: 'y',
            action: 'z',
            priority: 'urgentísimo',
            relatedCategory: null,
            timeframe: 'Este mes',
            actionType: 'none',
          },
        ],
      }),
      baseInput()
    );
    expect(advice.recommendations).toHaveLength(0);
  });

  it('actionType inválido cae a "none" en vez de descartar la recomendación', () => {
    const advice = parseFinancialAdviceResponse(
      validResponse({
        recommendations: [
          {
            id: '1',
            title: 'x',
            reason: 'y',
            action: 'z',
            priority: 'low',
            relatedCategory: null,
            timeframe: 'Este mes',
            actionType: 'invertir_en_cripto',
          },
        ],
      }),
      baseInput()
    );
    expect(advice.recommendations[0].actionType).toBe('none');
  });

  it('recomendación sin evidencia (title/reason/action vacíos) se descarta', () => {
    const advice = parseFinancialAdviceResponse(
      validResponse({
        recommendations: [
          { id: '1', title: '', reason: '', action: '', priority: 'low', timeframe: 'x', actionType: 'none' },
        ],
      }),
      baseInput()
    );
    expect(advice.recommendations).toHaveLength(0);
  });
});
