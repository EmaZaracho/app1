import { computeFundSelection, type FundOption } from '../src/domain/movementRules';

const ONE_FUND: FundOption[] = [{ id: 1, isDefault: true }];
const THREE_FUNDS: FundOption[] = [
  { id: 1, isDefault: true },
  { id: 2, isDefault: false },
  { id: 3, isDefault: false },
];

describe('reglas de selección de fondos', () => {
  it('con un solo fondo, gasto e ingreso se asignan automáticamente', () => {
    const gasto = computeFundSelection({ type: 'gasto', resolvedSourceId: null, resolvedDestId: null, activeFunds: ONE_FUND });
    expect(gasto.sourceFundId).toBe(1);
    expect(gasto.canConfirm).toBe(true);

    const ingreso = computeFundSelection({ type: 'ingreso', resolvedSourceId: null, resolvedDestId: null, activeFunds: ONE_FUND });
    expect(ingreso.destinationFundId).toBe(1);
    expect(ingreso.canConfirm).toBe(true);
  });

  it('con varios fondos y ninguno especificado, requiere selección', () => {
    const gasto = computeFundSelection({ type: 'gasto', resolvedSourceId: null, resolvedDestId: null, activeFunds: THREE_FUNDS });
    expect(gasto.needsSource).toBe(true);
    expect(gasto.canConfirm).toBe(false);
  });

  it('un gasto sin fondo usa el predeterminado cuando se provee', () => {
    const gasto = computeFundSelection({ type: 'gasto', resolvedSourceId: null, resolvedDestId: null, activeFunds: THREE_FUNDS, defaultFundId: 1 });
    expect(gasto.sourceFundId).toBe(1);
    expect(gasto.canConfirm).toBe(true);
  });

  it('un ingreso sin fondo NO usa el predeterminado (se pregunta)', () => {
    const ingreso = computeFundSelection({ type: 'ingreso', resolvedSourceId: null, resolvedDestId: null, activeFunds: THREE_FUNDS, defaultFundId: 1 });
    expect(ingreso.destinationFundId).toBeNull();
    expect(ingreso.needsDestination).toBe(true);
  });

  it('una transferencia requiere dos fondos activos distintos', () => {
    const single = computeFundSelection({ type: 'transferencia', resolvedSourceId: null, resolvedDestId: null, activeFunds: ONE_FUND });
    expect(single.canConfirm).toBe(false);
    expect(single.blockingMessage).toBeTruthy();

    const missingDest = computeFundSelection({ type: 'transferencia', resolvedSourceId: 1, resolvedDestId: null, activeFunds: THREE_FUNDS });
    expect(missingDest.needsDestination).toBe(true);
    expect(missingDest.canConfirm).toBe(false);

    const ok = computeFundSelection({ type: 'transferencia', resolvedSourceId: 1, resolvedDestId: 2, activeFunds: THREE_FUNDS });
    expect(ok.canConfirm).toBe(true);

    const same = computeFundSelection({ type: 'transferencia', resolvedSourceId: 1, resolvedDestId: 1, activeFunds: THREE_FUNDS });
    expect(same.canConfirm).toBe(false);
  });
});
