import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { statusColor } from './OccurrenceStatusBadge';
import { formatCurrency } from '../utils/format';
import type { EffectiveOccurrenceStatus } from '../types/recurringExpenses';

export interface DayCellData {
  day: number;
  dateStr: string;
  statuses: EffectiveOccurrenceStatus[];
  knownTotal: number;
}

interface CalendarDayCellProps {
  data: DayCellData | null; // null = fuera del mes
  isToday: boolean;
  isSelected: boolean;
  onPress: (dateStr: string) => void;
}

export function CalendarDayCell({ data, isToday, isSelected, onPress }: CalendarDayCellProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!data) return <View style={styles.cell} />;

  const dots = data.statuses.slice(0, 3);
  const extra = data.statuses.length - dots.length;

  return (
    <Pressable
      style={[
        styles.cell,
        isSelected && styles.cellSelected,
        isToday && !isSelected && styles.cellToday,
      ]}
      onPress={() => onPress(data.dateStr)}
    >
      <Text style={[styles.dayNumber, isToday && styles.dayNumberToday]}>{data.day}</Text>
      <View style={styles.dotsRow}>
        {dots.map((s, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: statusColor(s, theme) }]} />
        ))}
        {extra > 0 ? <Text style={styles.extra}>+{extra}</Text> : null}
      </View>
      {data.knownTotal > 0 ? (
        <Text style={styles.amount} numberOfLines={1}>
          {formatCurrency(data.knownTotal)}
        </Text>
      ) : null}
    </Pressable>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    cell: {
      flex: 1,
      aspectRatio: 0.82,
      padding: 2,
      borderRadius: 8,
      alignItems: 'center',
    },
    cellSelected: { backgroundColor: theme.primary },
    cellToday: { borderWidth: 1, borderColor: theme.primary },
    dayNumber: { fontSize: 13, color: theme.text, fontWeight: '600' },
    dayNumberToday: { color: theme.primary },
    dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2, minHeight: 8 },
    dot: { width: 6, height: 6, borderRadius: 3 },
    extra: { fontSize: 9, color: theme.textMuted, fontWeight: '700' },
    amount: { fontSize: 9, color: theme.textSecondary, marginTop: 1 },
  });
}
