import { createFund, getFunds } from '../src/db/fundsRepo';
import {
  addMovement,
  deleteMovement,
  restoreMovement,
  updateMovement,
} from '../src/db/movementsRepo';
import { getFundBalance } from '../src/db/balances';
import { freshDb } from './helpers';

describe('edición, eliminación y restauración', () => {
  it('cambiar el monto actualiza el saldo derivado', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const m = await addMovement(db, { type: 'gasto', amount: 100, category: 'Comida', description: 'x', rawText: 'x', sourceFundId: efectivo, destinationFundId: null });
    expect(await getFundBalance(db, efectivo)).toBe(-100);

    await updateMovement(db, m.id, { ...m, amount: 250 });
    expect(await getFundBalance(db, efectivo)).toBe(-250);
  });

  it('cambiar el fondo mueve el efecto al fondo correcto', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const banco = await createFund(db, { name: 'Banco' });
    const m = await addMovement(db, { type: 'gasto', amount: 100, category: 'Comida', description: 'x', rawText: 'x', sourceFundId: efectivo, destinationFundId: null });

    await updateMovement(db, m.id, { ...m, sourceFundId: banco });
    expect(await getFundBalance(db, efectivo)).toBe(0);
    expect(await getFundBalance(db, banco)).toBe(-100);
  });

  it('editar una transferencia conserva sus invariantes', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const banco = await createFund(db, { name: 'Banco' });
    const m = await addMovement(db, { type: 'transferencia', amount: 300, category: null, description: 't', rawText: 't', sourceFundId: efectivo, destinationFundId: banco });

    // origen == destino debe rechazarse
    await expect(
      updateMovement(db, m.id, { ...m, destinationFundId: efectivo })
    ).rejects.toThrow();
  });

  it('eliminar revierte el impacto y restaurar lo recupera exactamente', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    const m = await addMovement(db, { type: 'gasto', amount: 100, category: 'Comida', description: 'x', rawText: 'x', sourceFundId: efectivo, destinationFundId: null });
    expect(await getFundBalance(db, efectivo)).toBe(-100);

    await deleteMovement(db, m.id);
    expect(await getFundBalance(db, efectivo)).toBe(0);

    await restoreMovement(db, m);
    expect(await getFundBalance(db, efectivo)).toBe(-100);
  });
});
