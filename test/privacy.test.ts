import { getFunds, createFund } from '../src/db/fundsRepo';
import { addMovement } from '../src/db/movementsRepo';
import { buildFinancialSnapshot } from '../src/analytics/financialSnapshot';
import { buildAdviceInputFromSnapshot } from '../src/types/financialAdvice';
import { freshDb } from './helpers';

const NOW = new Date(2026, 6, 20, 12, 0, 0);

describe('privacidad del payload enviado a la IA', () => {
  it('el input a la IA no incluye movimientos individuales, texto, descripciones, ids ni fondos', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const banco = await createFund(db, { name: 'Banco Muy Secreto', aliases: ['secreto'] });

    await addMovement(db, {
      type: 'gasto',
      amount: 12345,
      category: 'Comida',
      description: 'Descripción sensible con nombre de comercio',
      rawText: 'gasté 12345 en el super de la esquina con Banco Muy Secreto',
      sourceFundId: banco,
      destinationFundId: null,
    });
    await addMovement(db, {
      type: 'ingreso',
      amount: 500000,
      category: 'Sueldo',
      description: 'x',
      rawText: 'x',
      sourceFundId: null,
      destinationFundId: efectivo,
    });

    const snapshot = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    const input = buildAdviceInputFromSnapshot(snapshot);
    const serialized = JSON.stringify(input);

    // No debe existir ningún rastro de texto original, descripción o nombre de fondo.
    expect(serialized).not.toContain('rawText');
    expect(serialized).not.toContain('gasté 12345');
    expect(serialized).not.toContain('Descripción sensible');
    expect(serialized).not.toContain('Banco Muy Secreto');
    expect(serialized).not.toContain('secreto');
    expect(serialized).not.toContain('sourceFundId');
    expect(serialized).not.toContain('destinationFundId');
    expect(serialized).not.toContain('fundId');
    // Tampoco debe viajar ningún id de movimiento ni el objeto `activity` completo
    // (deliberadamente excluido de FinancialAdviceInput; solo se envía el conteo
    // agregado dentro de `dataQuality`, no la actividad detallada por tipo).
    expect(serialized).not.toContain('"id"');
    expect(input).not.toHaveProperty('activity');
    expect(serialized).not.toContain('expenseCount');
    expect(serialized).not.toContain('largestExpense');

    // Sí debe contener datos agregados legítimos.
    expect(input.totals.income).toBe(500000);
    expect(input.categoryExpenses.some((c) => c.category === 'Comida')).toBe(true);
  });

  it('nunca incluye la API key en ningún campo', async () => {
    const db = await freshDb();
    const snapshot = await buildFinancialSnapshot(db, { preset: 'current_month', now: NOW });
    const input = buildAdviceInputFromSnapshot(snapshot);
    const serialized = JSON.stringify(input).toLowerCase();
    expect(serialized).not.toContain('apikey');
    expect(serialized).not.toContain('api_key');
  });
});
