import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { formatCurrency } from '../utils/format';
import { useTheme, type Theme } from '../theme';
import type { SlideStats } from '../db/balances';
import type { FundWithBalance } from '../types';
import { getBalanceVisibility, setBalanceVisibility } from '../services/balanceVisibility';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_MARGIN = 16;

/** Un slide del carrusel: el Total sintético o un fondo concreto. */
export type CarouselSlide =
  | { kind: 'total'; stats: SlideStats }
  | { kind: 'fund'; fund: FundWithBalance; stats: SlideStats };

interface FundCarouselProps {
  slides: CarouselSlide[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  onAddFund: () => void;
}

export function FundCarousel({ slides, activeIndex, onIndexChange, onAddFund }: FundCarouselProps) {
  const theme = useTheme();
  const styles = React.useMemo(() => createStyles(theme), [theme]);
  const listRef = useRef<FlatList<CarouselSlide>>(null);
  const cardWidth = SCREEN_WIDTH - CARD_MARGIN * 2;
  const snap = cardWidth + CARD_MARGIN;

  const [balanceVisible, setBalanceVisible] = useState<boolean | null>(null);
  const userToggledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getBalanceVisibility()
      .then((value) => {
        if (!cancelled && !userToggledRef.current) {
          setBalanceVisible(value);
        }
      })
      .catch(() => {
        // fail-closed: keep null (masked) on read error
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleVisibility = useCallback(async () => {
    userToggledRef.current = true;
    const next = !balanceVisible;
    setBalanceVisible(next);
    try {
      await setBalanceVisibility(next);
    } catch {
      // fail-closed: mask amounts if persistence fails
      setBalanceVisible(false);
    }
  }, [balanceVisible]);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / snap);
      if (index !== activeIndex && index >= 0 && index < slides.length) {
        onIndexChange(index);
      }
    },
    [activeIndex, onIndexChange, slides.length, snap]
  );

  return (
    <View>
      <FlatList
        ref={listRef}
        data={slides}
        keyExtractor={(item, i) => (item.kind === 'fund' ? `fund-${item.fund.id}` : `total-${i}`)}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={snap}
        decelerationRate="fast"
        contentContainerStyle={styles.listContent}
        onMomentumScrollEnd={handleScroll}
        renderItem={({ item }) => (
          <View style={[styles.card, { width: cardWidth }]}>
            <SlideContent
              slide={item}
              styles={styles}
              theme={theme}
              balanceVisible={balanceVisible}
              onToggleVisibility={toggleVisibility}
            />
          </View>
        )}
        ListFooterComponent={
          <Pressable style={[styles.addCard]} onPress={onAddFund}>
            <Text style={styles.addPlus}>＋</Text>
            <Text style={styles.addLabel}>Agregar fondo</Text>
          </Pressable>
        }
      />
      <View style={styles.dotsRow}>
        {slides.map((s, i) => (
          <View
            key={i}
            style={[styles.dot, i === activeIndex ? styles.dotActive : styles.dotInactive]}
          />
        ))}
      </View>
    </View>
  );
}

function SlideContent({
  slide,
  styles,
  theme,
  balanceVisible,
  onToggleVisibility,
}: {
  slide: CarouselSlide;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
  balanceVisible: boolean | null;
  onToggleVisibility: () => void;
}) {
  const isTotal = slide.kind === 'total';
  const title = isTotal ? 'Total' : slide.fund.name;
  const icon = isTotal ? '📊' : slide.fund.icon;
  const stats = slide.stats;
  const negative = stats.balance < 0;
  const masked = balanceVisible === null || balanceVisible === false;

  const fmt = (amount: number) => (masked ? '***' : formatCurrency(amount));

  return (
    <>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>
          {icon} {title}
        </Text>
        {!isTotal && slide.fund.isDefault ? (
          <Text style={styles.defaultTag}>Predeterminado</Text>
        ) : null}
      </View>
      <View style={styles.balanceRow}>
        <Text style={[styles.balance, negative && !masked && { color: theme.danger }]}>
          {fmt(stats.balance)}
        </Text>
        <Pressable
          onPress={onToggleVisibility}
          accessibilityRole="button"
          accessibilityLabel={balanceVisible ? 'Ocultar saldo' : 'Mostrar saldo'}
          accessibilityHint="Afecta todos los montos monetarios de este carrusel"
          style={styles.eyeButton}
        >
          <Text style={styles.eyeIcon}>{balanceVisible ? '👁' : '🙈'}</Text>
        </Pressable>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Ingresos</Text>
          <Text style={[styles.statValue, !masked && { color: theme.success }]}>
            {fmt(stats.income)}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Gastos</Text>
          <Text style={[styles.statValue, !masked && { color: theme.danger }]}>
            {fmt(stats.expense)}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Este mes</Text>
          <Text
            style={[
              styles.statValue,
              !masked && { color: stats.monthlyVariation < 0 ? theme.danger : theme.success },
            ]}
          >
            {fmt(stats.monthlyVariation)}
          </Text>
        </View>
      </View>
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    listContent: { paddingHorizontal: CARD_MARGIN, gap: CARD_MARGIN, paddingVertical: 12 },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      padding: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
    defaultTag: {
      fontSize: 10,
      color: theme.primary,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    balanceRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
    balance: { fontSize: 30, fontWeight: '800', color: theme.text },
    eyeButton: { padding: 4 },
    eyeIcon: { fontSize: 20 },
    statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
    statItem: { flex: 1 },
    statLabel: { fontSize: 11, color: theme.textMuted },
    statValue: { fontSize: 14, fontWeight: '700', marginTop: 2, color: theme.text },
    addCard: {
      width: 120,
      marginRight: CARD_MARGIN,
      borderRadius: 16,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addPlus: { fontSize: 28, color: theme.primary, fontWeight: '700' },
    addLabel: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },
    dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 2, marginBottom: 4 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    dotActive: { backgroundColor: theme.primary },
    dotInactive: { backgroundColor: theme.border },
  });
}
