import { initDatabase } from '../src/db/schema';
import { getFunds } from '../src/db/fundsRepo';
import { getMovements } from '../src/db/movementsRepo';
import { legacyDb, type LegacyExpense } from './helpers';

const LEGACY: LegacyExpense[] = [
  { id: 1, type: 'gasto', amount: 1500, category: 'Comida', description: 'Cafe', rawText: 'gaste 1500 en cafe', createdAt: '2026-05-01T10:00:00.000Z' },
  { id: 2, type: 'ingreso', amount: 800000, category: 'Sueldo', description: 'Sueldo', rawText: 'cobre el sueldo', createdAt: '2026-05-02T10:00:00.000Z' },
  { id: 3, type: 'gasto', amount: 3000, category: 'Transporte', description: 'Nafta', rawText: 'pague 3000 de nafta', createdAt: '2026-05-03T10:00:00.000Z' },
];

describe('migración desde expenses', () => {
  it('conserva todos los movimientos con sus ids y fechas', async () => {
    const db = await legacyDb(LEGACY);
    await initDatabase(db);

    const movements = await getMovements(db);
    expect(movements).toHaveLength(3);

    const byId = new Map(movements.map((m) => [m.id, m]));
    expect(byId.get(1)?.createdAt).toBe('2026-05-01T10:00:00.000Z');
    expect(byId.get(2)?.amount).toBe(800000);
    expect(byId.get(3)?.category).toBe('Transporte');
  });

  it('crea el fondo Efectivo una sola vez, predeterminado y activo', async () => {
    const db = await legacyDb(LEGACY);
    await initDatabase(db);

    const funds = await getFunds(db, true);
    const efectivo = funds.filter((f) => f.name === 'Efectivo');
    expect(efectivo).toHaveLength(1);
    expect(efectivo[0].isDefault).toBe(true);
    expect(efectivo[0].isArchived).toBe(false);
  });

  it('asigna Efectivo como origen de gastos y destino de ingresos', async () => {
    const db = await legacyDb(LEGACY);
    await initDatabase(db);

    const funds = await getFunds(db, true);
    const efectivoId = funds.find((f) => f.name === 'Efectivo')!.id;
    const movements = await getMovements(db);

    const gasto = movements.find((m) => m.id === 1)!;
    expect(gasto.sourceFundId).toBe(efectivoId);
    expect(gasto.destinationFundId).toBeNull();

    const ingreso = movements.find((m) => m.id === 2)!;
    expect(ingreso.destinationFundId).toBe(efectivoId);
    expect(ingreso.sourceFundId).toBeNull();
  });

  it('es idempotente: reejecutar no duplica fondos ni movimientos', async () => {
    const db = await legacyDb(LEGACY);
    await initDatabase(db);
    await initDatabase(db);
    await initDatabase(db);

    expect(await getMovements(db)).toHaveLength(3);
    expect((await getFunds(db, true)).filter((f) => f.name === 'Efectivo')).toHaveLength(1);
  });

  it('en una instalación nueva crea Efectivo automáticamente', async () => {
    const db = await legacyDb([]);
    // sin tabla expenses previa se comporta como instalación nueva
    await db.execAsync('DROP TABLE expenses;');
    await initDatabase(db);
    const funds = await getFunds(db, true);
    expect(funds).toHaveLength(1);
    expect(funds[0].name).toBe('Efectivo');
    expect(funds[0].isDefault).toBe(true);
  });
});
