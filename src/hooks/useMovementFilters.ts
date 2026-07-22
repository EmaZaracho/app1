import { useMemo, useState } from 'react';
import {
  filterMovements,
  hasAdvancedFilter as computeHasAdvancedFilter,
  isFilteringActive,
} from '../domain/movementFilters';
import type { Category, HomeMovementFilter, Movement, MovementType } from '../types';

export interface MovementPeriod {
  start: string;
  end: string;
}

export interface UseMovementFiltersResult {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  filterType: MovementType | null;
  setFilterType: (v: MovementType | null) => void;
  filterCategory: Category | null;
  filterPeriod: MovementPeriod | null;
  filteredMovements: Movement[];
  isFiltering: boolean;
  hasAdvancedFilter: boolean;
  clearAdvancedFilters: () => void;
  applyExternalFilter: (filter: HomeMovementFilter) => void;
}

/**
 * Estado y resultado de los filtros de movimientos de Inicio. La lógica de
 * filtrado en sí vive en `domain/movementFilters.ts` (pura, testeada); acá
 * solo se declara el `useMemo` con TODAS las dependencias relevantes
 * (búsqueda, tipo, categoría, período y movimientos) para que nunca quede
 * desactualizado.
 */
export function useMovementFilters(movements: Movement[]): UseMovementFiltersResult {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<MovementType | null>(null);
  const [filterCategory, setFilterCategory] = useState<Category | null>(null);
  const [filterPeriod, setFilterPeriod] = useState<MovementPeriod | null>(null);

  const filterState = { searchQuery, filterType, filterCategory, filterPeriod };

  const filteredMovements = useMemo(
    () => filterMovements(movements, filterState),
    [movements, searchQuery, filterType, filterCategory, filterPeriod]
  );

  const isFiltering = isFilteringActive(filterState);
  const hasAdvancedFilter = computeHasAdvancedFilter(filterState);

  function clearAdvancedFilters() {
    setFilterCategory(null);
    setFilterPeriod(null);
  }

  function applyExternalFilter(filter: HomeMovementFilter) {
    setFilterType(filter.type ?? null);
    setFilterCategory(filter.category ?? null);
    setFilterPeriod(
      filter.periodStart && filter.periodEnd ? { start: filter.periodStart, end: filter.periodEnd } : null
    );
  }

  return {
    searchQuery,
    setSearchQuery,
    filterType,
    setFilterType,
    filterCategory,
    filterPeriod,
    filteredMovements,
    isFiltering,
    hasAdvancedFilter,
    clearAdvancedFilters,
    applyExternalFilter,
  };
}
