import {
  assertFundsStillActive,
  buildMovementFromForm,
  computeFundSelection,
  type MovementFormInput,
} from '../src/domain/movementRules';

function baseInput(overrides: Partial<MovementFormInput> = {}): MovementFormInput {
  return {
    type: 'gasto',
    amountText: '1500',
    category: 'Comida',
    description: 'Café',
    sourceFundId: 1,
    destinationFundId: null,
    ...overrides,
  };
}

describe('buildMovementFromForm: registro manual', () => {
  it('gasto válido', () => {
    const result = buildMovementFromForm(baseInput(), '[manual] Café');
    expect(result.error).toBeUndefined();
    expect(result.movement).toEqual({
      type: 'gasto',
      amount: 1500,
      category: 'Comida',
      description: 'Café',
      rawText: '[manual] Café',
      sourceFundId: 1,
      destinationFundId: null,
    });
  });

  it('ingreso válido', () => {
    const result = buildMovementFromForm(
      baseInput({ type: 'ingreso', category: 'Sueldo', sourceFundId: null, destinationFundId: 2 }),
      '[manual] Sueldo'
    );
    expect(result.error).toBeUndefined();
    expect(result.movement?.type).toBe('ingreso');
    expect(result.movement?.destinationFundId).toBe(2);
  });

  it('transferencia válida (sin categoría)', () => {
    const result = buildMovementFromForm(
      baseInput({ type: 'transferencia', category: null, sourceFundId: 1, destinationFundId: 2, description: 'Ahorro' }),
      '[manual] Ahorro'
    );
    expect(result.error).toBeUndefined();
    expect(result.movement?.category).toBeNull();
  });

  it('monto inválido (no numérico, cero o negativo)', () => {
    expect(buildMovementFromForm(baseInput({ amountText: 'abc' }), 'x').error).toBeTruthy();
    expect(buildMovementFromForm(baseInput({ amountText: '0' }), 'x').error).toBeTruthy();
    expect(buildMovementFromForm(baseInput({ amountText: '-5' }), 'x').error).toBeTruthy();
  });

  it('descripción vacía', () => {
    const result = buildMovementFromForm(baseInput({ description: '   ' }), 'x');
    expect(result.error).toBe('Ingresá una descripción.');
  });

  it('categoría inválida para el tipo', () => {
    const result = buildMovementFromForm(baseInput({ type: 'ingreso', category: 'Comida', destinationFundId: 1, sourceFundId: null }), 'x');
    expect(result.error).toBeTruthy();
  });

  it('categoría faltante en gasto/ingreso', () => {
    const result = buildMovementFromForm(baseInput({ category: null }), 'x');
    expect(result.error).toBe('Elegí una categoría.');
  });

  it('fondo obligatorio: gasto sin origen', () => {
    const result = buildMovementFromForm(baseInput({ sourceFundId: null }), 'x');
    expect(result.error).toBeTruthy();
  });

  it('fondos iguales en transferencia', () => {
    const result = buildMovementFromForm(
      baseInput({ type: 'transferencia', category: null, sourceFundId: 1, destinationFundId: 1 }),
      'x'
    );
    expect(result.error).toBeTruthy();
  });

  it('raw_text manual usa el prefijo [manual]', () => {
    const result = buildMovementFromForm(baseInput(), '[manual] Café');
    expect(result.movement?.rawText).toBe('[manual] Café');
  });
});

describe('autoasignación de fondo en formulario manual (sin defaultFundId)', () => {
  it('gasto con un solo fondo activo se autoasigna', () => {
    const selection = computeFundSelection({
      type: 'gasto',
      resolvedSourceId: null,
      resolvedDestId: null,
      activeFunds: [{ id: 7, isDefault: true }],
    });
    expect(selection.sourceFundId).toBe(7);
    expect(selection.canConfirm).toBe(true);
  });

  it('ingreso con un solo fondo activo se autoasigna', () => {
    const selection = computeFundSelection({
      type: 'ingreso',
      resolvedSourceId: null,
      resolvedDestId: null,
      activeFunds: [{ id: 7, isDefault: true }],
    });
    expect(selection.destinationFundId).toBe(7);
    expect(selection.canConfirm).toBe(true);
  });

  it('con varios fondos activos, NO autoasigna (ni el predeterminado) sin defaultFundId', () => {
    const selection = computeFundSelection({
      type: 'gasto',
      resolvedSourceId: null,
      resolvedDestId: null,
      activeFunds: [
        { id: 1, isDefault: true },
        { id: 2, isDefault: false },
      ],
      // defaultFundId deliberadamente omitido: así llama el formulario manual.
    });
    expect(selection.sourceFundId).toBeNull();
    expect(selection.needsSource).toBe(true);
    expect(selection.canConfirm).toBe(false);
  });

  it('transferencia con un solo fondo activo queda bloqueada', () => {
    const selection = computeFundSelection({
      type: 'transferencia',
      resolvedSourceId: null,
      resolvedDestId: null,
      activeFunds: [{ id: 1, isDefault: true }],
    });
    expect(selection.canConfirm).toBe(false);
    expect(selection.blockingMessage).toBeTruthy();
  });
});

describe('assertFundsStillActive', () => {
  it('null pasa siempre (fondo no aplica)', () => {
    expect(assertFundsStillActive([null], new Set([1, 2]))).toBeNull();
  });

  it('rechaza un fondo archivado/inexistente en el set activo', () => {
    expect(assertFundsStillActive([1, 5], new Set([1, 2]))).toBeTruthy();
  });

  it('acepta cuando todos los fondos siguen activos', () => {
    expect(assertFundsStillActive([1, 2], new Set([1, 2, 3]))).toBeNull();
  });
});
