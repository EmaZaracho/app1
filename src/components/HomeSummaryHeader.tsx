import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions } from 'react-native';
import { FundCarousel, type CarouselSlide } from './FundCarousel';
import { HomeActionMenu } from './HomeActionMenu';
import { HomeAlerts } from './HomeAlerts';
import { formatCurrency } from '../utils/format';
import { getBalanceVisibility } from '../services/balanceVisibility';
import { useTheme, type Theme } from '../theme';
import type { AIProvider } from '../types';
import type { BudgetAlert } from '../db/database';

/**
 * Alto de ventana (dp) debajo del cual Inicio abre con el resumen colapsado.
 * En Android con ventana reducida (split-screen, algunos plegables), el
 * carrusel + acciones + alertas dejaban sin altura táctil a la lista.
 */
const COMPACT_HEADER_HEIGHT_THRESHOLD = 700;

interface HomeSummaryHeaderProps {
  slides: CarouselSlide[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  onAddFund: () => void;
  onRegisterAI: () => void;
  onRegisterManual: () => void;
  onScanReceipt: () => void;
  onTransfer: () => void;
  hasApiKey: boolean;
  activeProvider: AIProvider;
  budgetAlerts: BudgetAlert[];
  onPressApiKey: () => void;
  onPressBudget: () => void;
}

/**
 * Resumen de Inicio (carrusel + acciones + alertas), pensado para vivir en el
 * encabezado desplazable de la lista de movimientos. En ventanas bajas abre
 * colapsado como una fila compacta con el saldo del slide activo.
 */
export function HomeSummaryHeader({
  slides,
  activeIndex,
  onIndexChange,
  onAddFund,
  onRegisterAI,
  onRegisterManual,
  onScanReceipt,
  onTransfer,
  hasApiKey,
  activeProvider,
  budgetAlerts,
  onPressApiKey,
  onPressBudget,
}: HomeSummaryHeaderProps) {
  const theme = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const { height } = useWindowDimensions();
  const isCompactWindow = height < COMPACT_HEADER_HEIGHT_THRESHOLD;
  const [expanded, setExpanded] = useState(() => !isCompactWindow);
  const [balanceVisible, setBalanceVisible] = useState(false);
  const wasCompactWindowRef = useRef(isCompactWindow);

  // Colapsa automáticamente si la ventana pasa de altura normal a reducida
  // (p. ej. al minimizar la app en Android). No vuelve a expandir solo al
  // crecer de nuevo: eso preservaría una expansión manual del usuario.
  useEffect(() => {
    if (isCompactWindow && !wasCompactWindowRef.current) {
      setExpanded(false);
    }
    wasCompactWindowRef.current = isCompactWindow;
  }, [isCompactWindow]);

  useEffect(() => {
    let cancelled = false;
    getBalanceVisibility()
      .then((value) => {
        if (!cancelled) setBalanceVisible(value);
      })
      .catch(() => {
        // fail-closed: mantiene el saldo enmascarado ante un error de lectura
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeSlide = slides[activeIndex];
  const balanceText = activeSlide ? (balanceVisible ? formatCurrency(activeSlide.stats.balance) : '***') : '';

  if (expanded) {
    return (
      <>
        {slides.length > 0 ? (
          <FundCarousel
            slides={slides}
            activeIndex={activeIndex}
            onIndexChange={onIndexChange}
            onAddFund={onAddFund}
          />
        ) : null}
        <HomeActionMenu
          onRegisterAI={onRegisterAI}
          onRegisterManual={onRegisterManual}
          onScanReceipt={onScanReceipt}
          onTransfer={onTransfer}
        />
        <HomeAlerts
          hasApiKey={hasApiKey}
          activeProvider={activeProvider}
          budgetAlerts={budgetAlerts}
          onPressApiKey={onPressApiKey}
          onPressBudget={onPressBudget}
        />
      </>
    );
  }

  return (
    <Pressable
      style={styles.collapseRow}
      onPress={() => setExpanded(true)}
      accessibilityRole="button"
      accessibilityLabel="Mostrar resumen"
      accessibilityHint="Expande el carrusel de fondos y las acciones de Inicio"
    >
      <Text style={styles.collapseLabel}>Total {balanceText}</Text>
      <Text style={styles.collapseAction}>Mostrar</Text>
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    collapseRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: theme.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.border,
    },
    collapseLabel: { fontSize: 15, fontWeight: '700', color: theme.text },
    collapseAction: { fontSize: 13, fontWeight: '700', color: theme.primary },
  });
}
