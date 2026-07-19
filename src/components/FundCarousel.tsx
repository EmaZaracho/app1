import React, { useCallback, useRef, useState } from 'react';
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
            <SlideContent slide={item} styles={styles} theme={theme} />
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
}: {
  slide: CarouselSlide;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}) {
  const isTotal = slide.kind === 'total';
  const title = isTotal ? 'Total' : slide.fund.name;
  const icon = isTotal ? '📊' : slide.fund.icon;
  const stats = slide.stats;
  const negative = stats.balance < 0;

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
      <Text style={[styles.balance, negative && { color: theme.danger }]}>
        {formatCurrency(stats.balance)}
      </Text>
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Ingresos</Text>
          <Text style={[styles.statValue, { color: theme.success }]}>
            {formatCurrency(stats.income)}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Gastos</Text>
          <Text style={[styles.statValue, { color: theme.danger }]}>
            {formatCurrency(stats.expense)}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Este mes</Text>
          <Text
            style={[
              styles.statValue,
              { color: stats.monthlyVariation < 0 ? theme.danger : theme.success },
            ]}
          >
            {formatCurrency(stats.monthlyVariation)}
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
    balance: { fontSize: 30, fontWeight: '800', color: theme.text, marginTop: 8 },
    statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
    statItem: { flex: 1 },
    statLabel: { fontSize: 11, color: theme.textMuted },
    statValue: { fontSize: 14, fontWeight: '700', marginTop: 2 },
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
