import { useCallback, useState } from 'react';
import { LayoutAnimation } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getBudgetProgress,
  getFunds,
  getFundsWithBalances,
  getFundStats,
  getMovements,
  getMovementsForFund,
  getPurchaseMerchants,
  getTotalStats,
  type BudgetProgress,
} from '../db/database';
import { getTrackingStart } from '../db/financialPreferencesRepository';
import type { CarouselSlide } from '../components/FundCarousel';
import type { SqlDatabase } from '../db/sqlDatabase';
import type { Fund, FundWithBalance, Movement } from '../types';

export interface UseHomeDataResult {
  funds: FundWithBalance[];
  allFunds: Fund[];
  slides: CarouselSlide[];
  activeIndex: number;
  movements: Movement[];
  purchaseMerchants: Map<number, string | null>;
  budgetAlerts: BudgetProgress[];
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
  const [purchaseMerchants, setPurchaseMerchants] = useState<Map<number, string | null>>(new Map());
  const [budgetAlerts, setBudgetAlerts] = useState<BudgetProgress[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);

  const buildSlides = useCallback(
    async (activeFunds: FundWithBalance[], trackingStart: string | null): Promise<CarouselSlide[]> => {
      const totalStats = await getTotalStats(db, trackingStart);
      const fundStats = await Promise.all(activeFunds.map((f) => getFundStats(db, f.id, trackingStart)));
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
      const [list, merchants] = await Promise.all([
        slide.kind === 'fund' ? getMovementsForFund(db, slide.fund.id) : getMovements(db),
        getPurchaseMerchants(db),
      ]);
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMovements(list);
      setPurchaseMerchants(merchants);
    },
    [db]
  );

  const reload = useCallback(async () => {
    const [activeFunds, everyFund, trackingStart] = await Promise.all([
      getFundsWithBalances(db, false),
      getFunds(db, true),
      getTrackingStart(db),
    ]);
    const [alerts, nextSlides] = await Promise.all([
      getBudgetProgress(db, trackingStart),
      buildSlides(activeFunds, trackingStart),
    ]);
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
    purchaseMerchants,
    budgetAlerts,
    initialLoading,
    selectSlide,
    reload,
  };
}
