import {
  archiveFund,
  createFund,
  deleteFund,
  getFundMatchTargets,
  getFunds,
} from '../src/db/fundsRepo';
import { addMovement } from '../src/db/movementsRepo';
import { resolveFundReference, findNameConflicts } from '../src/domain/fundMatching';
import { freshDb } from './helpers';

describe('matching de fondos', () => {
  it('reconoce nombres y alias ignorando mayúsculas, espacios y acentos', async () => {
    const db = await freshDb();
    const banco = await createFund(db, { name: 'Banco Nación', aliases: ['BNA', 'cuenta sueldo'] });
    const targets = await getFundMatchTargets(db, true);

    expect(resolveFundReference('banco  nacion', targets)).toEqual({ status: 'matched', fundId: banco });
    expect(resolveFundReference('BNA', targets)).toEqual({ status: 'matched', fundId: banco });
    expect(resolveFundReference('  Cuenta Sueldo ', targets)).toEqual({ status: 'matched', fundId: banco });
  });

  it('no acepta fondos inexistentes', async () => {
    const db = await freshDb();
    const targets = await getFundMatchTargets(db, true);
    expect(resolveFundReference('galicia', targets)).toEqual({ status: 'not_found' });
  });

  it('detecta alias ambiguos entre fondos', () => {
    const targets = [
      { id: 1, name: 'Uno', normalizedName: 'uno', aliases: [{ normalizedAlias: 'plata' }] },
      { id: 2, name: 'Dos', normalizedName: 'dos', aliases: [{ normalizedAlias: 'plata' }] },
    ];
    const result = resolveFundReference('plata', targets);
    expect(result.status).toBe('ambiguous');
  });

  it('rechaza crear un fondo con nombre o alias en conflicto', async () => {
    const db = await freshDb();
    await createFund(db, { name: 'Mercado Pago', aliases: ['MP'] });
    await expect(createFund(db, { name: 'mercado  pago' })).rejects.toThrow();
    await expect(createFund(db, { name: 'Otro', aliases: ['mp'] })).rejects.toThrow();
  });

  it('findNameConflicts contempla el nombre canónico', () => {
    const targets = [{ id: 1, name: 'Efectivo', normalizedName: 'efectivo', aliases: [] }];
    expect(findNameConflicts(['Efectivo'], targets)).toEqual(['Efectivo']);
    expect(findNameConflicts(['Banco'], targets)).toEqual([]);
  });
});

describe('archivado y eliminación de fondos', () => {
  it('un fondo con movimientos no se puede eliminar físicamente', async () => {
    const db = await freshDb();
    const banco = await createFund(db, { name: 'Banco' });
    await addMovement(db, { type: 'ingreso', amount: 100, category: 'Sueldo', description: 'x', rawText: 'x', sourceFundId: null, destinationFundId: banco });
    await expect(deleteFund(db, banco)).rejects.toThrow();
  });

  it('un fondo con saldo distinto de cero no se puede archivar', async () => {
    const db = await freshDb();
    const banco = await createFund(db, { name: 'Banco', initialBalance: 500 });
    await expect(archiveFund(db, banco)).rejects.toThrow();
  });

  it('no se puede archivar el último fondo activo', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id;
    await expect(archiveFund(db, efectivo)).rejects.toThrow();
  });

  it('archivar reasigna el predeterminado a otro fondo activo', async () => {
    const db = await freshDb();
    const efectivo = (await getFunds(db, false))[0].id; // default
    const banco = await createFund(db, { name: 'Banco' });
    await archiveFund(db, efectivo); // saldo 0, hay 2 activos
    const funds = await getFunds(db, true);
    const def = funds.find((f) => f.isDefault && !f.isArchived);
    expect(def?.id).toBe(banco);
  });
});
