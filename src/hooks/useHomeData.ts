import { useCallback, useState } from 'react';
import { LayoutAnimation } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getBudgetAlerts,
  getFunds,
  getFundsWithBalances,
  getFundStats,
  getMovements,
  getMovementsForFund,
  getTotalStats,
  type BudgetAlert,
} from '../db/database';
import type { CarouselSlide } from '../components/FundCarousel';
import type { SqlDatabase } from '../db/sqlDatabase';
import type { Fund, FundWithBalance, Movement } from '../types';

export interface UseHomeDataResult {
  funds: FundWithBalance[];
  allFunds: Fund[];
  slides: CarouselSlide[];
  activeIndex: number;
  movements: Movement[];
  budgetAlerts: BudgetAlert[];
  initialLoading: boolean;
  selectSlide: (index: number) => void;
  reload: () => Promise<void>;
}

/**
 * Datos financieros de Inicio: fondos, slides del carrusel, estadísticas,
 * movimientos del slide activo y alertas de presupuesto. Se recarga sola al
 * recuperar foco (útil al volver de un formulario/detalle). Los filtros de
 * texto/tipo/categoría/período viven aparte en `useMovementFilters`.
 */
export function useHomeData(db: SqlDatabase): UseHomeDataResult {
  const [funds, setFunds] = useState<FundWithBalance[]>([]);
  const [allFunds, setAllFunds] = useState<Fund[]>([]);
  const [slides, setSlides] = useState<CarouselSlide[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetAlert[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  const buildSlides = useCallback(
    async (activeFunds: FundWithBalance[]): Promise<CarouselSlide[]> => {
      const totalStats = await getTotalStats(db);
      const fundStats = await Promise.all(activeFunds.map((f) => getFundStats(db, f.id)));
      const fundSlides: CarouselSlide[] = activeFunds.map((fund, i) => ({
        kind: 'fund',
        fund,
        stats: fundStats[i],
      }));
      return [{ kind: 'total', stats: totalStats }, ...fundSlides];
    },
    [db]
  );

  const loadMovementsForSlide = useCallback(
    async (slide: CarouselSlide | undefined) => {
      if (!slide) return;
      const list =
        slide.kind === 'fund' ? await getMovementsForFund(db, slide.fund.id) : await getMovements(db);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMovements(list);
    },
    [db]
  );

  const reload = useCallback(async () => {
    const [activeFunds, everyFund, alerts] = await Promise.all([
      getFundsWithBalances(db, false),
      getFunds(db, true),
      getBudgetAlerts(db),
    ]);
    const nextSlides = await buildSlides(activeFunds);
    setFunds(activeFunds);
    setAllFunds(everyFund);
    setSlides(nextSlides);
    setBudgetAlerts(alerts);
    setActiveIndex((prevIndex) => {
      const bounded = Math.min(prevIndex, nextSlides.length - 1);
      loadMovementsForSlide(nextSlides[bounded]);
      return bounded;
    });
    setInitialLoading(false);
  }, [db, buildSlides, loadMovementsForSlide]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  function selectSlide(index: number) {
    setActiveIndex(index);
    loadMovementsForSlide(slides[index]);
  }

  return {
    funds,
    allFunds,
    slides,
    activeIndex,
    movements,
    budgetAlerts,
    initialLoading,
    selectSlide,
    reload,
  };
}
