import type { Category, Movement, MovementType } from '../types';

export interface MovementPeriodFilter {
  /** Inclusivo. */
  start: string;
  /** Exclusivo. */
  end: string;
}

export interface MovementFilterState {
  searchQuery: string;
  filterType: MovementType | null;
  filterCategory: Category | null;
  filterPeriod: MovementPeriodFilter | null;
}

/**
 * Filtra movimientos por texto, tipo, categoría y período. Pura y sin estado:
 * la memoización de quien la use debe declarar TODOS los campos de
 * `MovementFilterState` (más `movements`) como dependencias para no quedar
 * desactualizada cuando cambia un filtro que no sea `searchQuery`/`filterType`.
 */
export function filterMovements(movements: Movement[], filters: MovementFilterState): Movement[] {
  const query = filters.searchQuery.trim().toLowerCase();
  return movements.filter((item) => {
    if (filters.filterType && item.type !== filters.filterType) return false;
    if (filters.filterCategory && item.category !== filters.filterCategory) return false;
    if (
      filters.filterPeriod &&
      (item.createdAt < filters.filterPeriod.start || item.createdAt >= filters.filterPeriod.end)
    ) {
      return false;
    }
    if (!query) return true;
    return (
      item.description.toLowerCase().includes(query) ||
      item.rawText.toLowerCase().includes(query) ||
      (item.category ?? '').toLowerCase().includes(query)
    );
  });
}

/** true si hay CUALQUIER filtro activo (texto, tipo, categoría o período). */
export function isFilteringActive(filters: MovementFilterState): boolean {
  return (
    filters.searchQuery.trim().length > 0 ||
    filters.filterType !== null ||
    filters.filterCategory !== null ||
    filters.filterPeriod !== null
  );
}

/** true si hay un filtro "avanzado" (categoría o período, los que no tienen chip propio). */
export function hasAdvancedFilter(filters: MovementFilterState): boolean {
  return filters.filterCategory !== null || filters.filterPeriod !== null;
}
