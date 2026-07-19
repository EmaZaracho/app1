import { createFund, getFunds } from '../src/db/fundsRepo';
import { addMovement } from '../src/db/movementsRepo';
import {
  getFundBalance,
  getTotalBalance,
  getGlobalIncomeExpense,
  getFundIncomeExpense,
} from '../src/db/balances';
import type { SqlDatabase } from '../src/db/sqlDatabase';
import { freshDb } from './helpers';

async function setup(): Promise<{ db: SqlDatabase; efectivo: number; banco: number }> {
  const db = await freshDb();
  const efectivo = (await getFunds(db, false))[0].id;
  const banco = await createFund(db, { name: 'Banco', aliases: ['BNA'] });
  return { db, efectivo, banco };
}

describe('cálculo de saldos', () => {
  it('un ingreso suma y un gasto resta en el fondo', async () => {
    const { db, efectivo } = await setup();
    await addMovement(db, { type: 'ingreso', amount: 1000, category: 'Sueldo', description: 'x', rawText: 'x', sourceFundId: null, destinationFundId: efectivo });
    await addMovement(db, { type: 'gasto', amount: 400, category: 'Comida', description: 'y', rawText: 'y', sourceFundId: efectivo, destinationFundId: null });
    expect(await getFundBalance(db, efectivo)).toBe(600);
  });

  it('una transferencia resta en origen y suma en destino', async () => {
    const { db, efectivo, banco } = await setup();
    await addMovement(db, { type: 'ingreso', amount: 1000, category: 'Sueldo', description: 'x', rawText: 'x', sourceFundId: null, destinationFundId: efectivo });
    await addMovement(db, { type: 'transferencia', amount: 300, category: null, description: 't', rawText: 't', sourceFundId: efectivo, destinationFundId: banco });
    expect(await getFundBalance(db, efectivo)).toBe(700);
    expect(await getFundBalance(db, banco)).toBe(300);
  });

  it('ajuste positivo suma y negativo resta', async () => {
    const { db, banco } = await setup();
    await addMovement(db, { type: 'ajuste', amount: 500, category: null, description: 'Saldo inicial', rawText: 'i', sourceFundId: null, destinationFundId: banco });
    await addMovement(db, { type: 'ajuste', amount: 200, category: null, description: 'Ajuste', rawText: 'a', sourceFundId: banco, destinationFundId: null });
    expect(await getFundBalance(db, banco)).toBe(300);
  });

  it('permite saldos negativos', async () => {
    const { db, efectivo } = await setup();
    await addMovement(db, { type: 'gasto', amount: 500, category: 'Comida', description: 'y', rawText: 'y', sourceFundId: efectivo, destinationFundId: null });
    expect(await getFundBalance(db, efectivo)).toBe(-500);
  });

  it('el total no cambia con transferencias pero sí con ajustes', async () => {
    const { db, efectivo, banco } = await setup();
    await addMovement(db, { type: 'ingreso', amount: 1000, category: 'Sueldo', description: 'x', rawText: 'x', sourceFundId: null, destinationFundId: efectivo });
    const totalBeforeTransfer = await getTotalBalance(db);
    await addMovement(db, { type: 'transferencia', amount: 400, category: null, description: 't', rawText: 't', sourceFundId: efectivo, destinationFundId: banco });
    expect(await getTotalBalance(db)).toBe(totalBeforeTransfer);

    await addMovement(db, { type: 'ajuste', amount: 250, category: null, description: 'a', rawText: 'a', sourceFundId: null, destinationFundId: banco });
    expect(await getTotalBalance(db)).toBe(totalBeforeTransfer + 250);
  });

  it('ingresos y gastos globales excluyen transferencias y ajustes', async () => {
    const { db, efectivo, banco } = await setup();
    await addMovement(db, { type: 'ingreso', amount: 1000, category: 'Sueldo', description: 'x', rawText: 'x', sourceFundId: null, destinationFundId: efectivo });
    await addMovement(db, { type: 'gasto', amount: 200, category: 'Comida', description: 'y', rawText: 'y', sourceFundId: efectivo, destinationFundId: null });
    await addMovement(db, { type: 'transferencia', amount: 400, category: null, description: 't', rawText: 't', sourceFundId: efectivo, destinationFundId: banco });
    await addMovement(db, { type: 'ajuste', amount: 999, category: null, description: 'a', rawText: 'a', sourceFundId: null, destinationFundId: banco });

    const global = await getGlobalIncomeExpense(db);
    expect(global.income).toBe(1000);
    expect(global.expense).toBe(200);
  });

  it('ingresos y gastos por fondo son los reales de ese fondo', async () => {
    const { db, efectivo, banco } = await setup();
    await addMovement(db, { type: 'ingreso', amount: 1000, category: 'Sueldo', description: 'x', rawText: 'x', sourceFundId: null, destinationFundId: efectivo });
    await addMovement(db, { type: 'transferencia', amount: 400, category: null, description: 't', rawText: 't', sourceFundId: efectivo, destinationFundId: banco });

    const efectivoIE = await getFundIncomeExpense(db, efectivo);
    expect(efectivoIE.income).toBe(1000); // la transferencia no cuenta como ingreso
    const bancoIE = await getFundIncomeExpense(db, banco);
    expect(bancoIE.income).toBe(0); // recibió por transferencia, no es ingreso real
  });
});
