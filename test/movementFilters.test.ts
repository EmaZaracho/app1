import {
  filterMovements,
  hasAdvancedFilter,
  isFilteringActive,
  type MovementFilterState,
} from '../src/domain/movementFilters';
import type { Movement } from '../src/types';

function mov(overrides: Partial<Movement> = {}): Movement {
  return {
    id: 1,
    type: 'gasto',
    amount: 100,
    category: 'Comida',
    description: 'Café',
    rawText: 'gasté 100 en café',
    sourceFundId: 1,
    destinationFundId: null,
    createdAt: '2026-08-05T10:00:00.000Z',
    ...overrides,
  };
}

function noFilter(overrides: Partial<MovementFilterState> = {}): MovementFilterState {
  return { searchQuery: '', filterType: null, filterCategory: null, filterPeriod: null, ...overrides };
}

describe('filterMovements', () => {
  it('filtra por categoría', () => {
    const movements = [
      mov({ id: 1, category: 'Comida' }),
      mov({ id: 2, category: 'Transporte' }),
    ];
    const result = filterMovements(movements, noFilter({ filterCategory: 'Transporte' }));
    expect(result.map((m) => m.id)).toEqual([2]);
  });

  it('filtra por período (start inclusivo, end exclusivo)', () => {
    const movements = [
      mov({ id: 1, createdAt: '2026-07-31T23:59:00.000Z' }),
      mov({ id: 2, createdAt: '2026-08-01T00:00:00.000Z' }),
      mov({ id: 3, createdAt: '2026-08-31T23:59:00.000Z' }),
      mov({ id: 4, createdAt: '2026-09-01T00:00:00.000Z' }),
    ];
    const result = filterMovements(
      movements,
      noFilter({ filterPeriod: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' } })
    );
    expect(result.map((m) => m.id)).toEqual([2, 3]);
  });

  it('combina tipo, categoría, período y texto simultáneamente', () => {
    const movements = [
      mov({ id: 1, type: 'gasto', category: 'Comida', description: 'Pizza', createdAt: '2026-08-05T00:00:00.000Z' }),
      mov({ id: 2, type: 'gasto', category: 'Comida', description: 'Pizza', createdAt: '2026-09-05T00:00:00.000Z' }),
      mov({ id: 3, type: 'ingreso', category: 'Sueldo', description: 'Pizza', createdAt: '2026-08-05T00:00:00.000Z' }),
    ];
    const result = filterMovements(
      movements,
      noFilter({
        filterType: 'gasto',
        filterCategory: 'Comida',
        filterPeriod: { start: '2026-08-01T00:00:00.000Z', end: '2026-09-01T00:00:00.000Z' },
        searchQuery: 'pizza',
      })
    );
    expect(result.map((m) => m.id)).toEqual([1]);
  });

  it('filtra por tipo ajuste', () => {
    const movements = [
      mov({ id: 1, type: 'ajuste', category: null, description: 'Ajuste manual' }),
      mov({ id: 2, type: 'gasto' }),
    ];
    const result = filterMovements(movements, noFilter({ filterType: 'ajuste' }));
    expect(result.map((m) => m.id)).toEqual([1]);
  });
});

describe('isFilteringActive', () => {
  it('false sin ningún filtro', () => {
    expect(isFilteringActive(noFilter())).toBe(false);
  });
  it('true solo con categoría (sin texto ni tipo)', () => {
    expect(isFilteringActive(noFilter({ filterCategory: 'Comida' }))).toBe(true);
  });
  it('true solo con período (sin texto ni tipo)', () => {
    expect(
      isFilteringActive(
        noFilter({ filterPeriod: { start: '2026-08-01', end: '2026-09-01' } })
      )
    ).toBe(true);
  });
  it('true con texto', () => {
    expect(isFilteringActive(noFilter({ searchQuery: 'café' }))).toBe(true);
  });
  it('true con tipo', () => {
    expect(isFilteringActive(noFilter({ filterType: 'ajuste' }))).toBe(true);
  });
});

describe('hasAdvancedFilter', () => {
  it('false sin categoría ni período', () => {
    expect(hasAdvancedFilter(noFilter())).toBe(false);
  });
  it('true con categoría', () => {
    expect(hasAdvancedFilter(noFilter({ filterCategory: 'Comida' }))).toBe(true);
  });
  it('true con período', () => {
    expect(hasAdvancedFilter(noFilter({ filterPeriod: { start: 'a', end: 'b' } }))).toBe(true);
  });
});
