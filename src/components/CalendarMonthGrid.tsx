import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { CalendarDayCell, type DayCellData } from './CalendarDayCell';
import { daysInMonth, parseMonthKey, toLocalDateString } from '../recurring/recurringDateUtils';
import type { RecurringExpenseOccurrence } from '../types/recurringExpenses';

const WEEKDAYS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

interface CalendarMonthGridProps {
  monthKey: string;
  occurrences: RecurringExpenseOccurrence[];
  today: string;
  selectedDate: string | null;
  onSelectDay: (dateStr: string) => void;
}

/** Índice de columna (0=Lunes … 6=Domingo) de un getDay() (0=Domingo). */
function mondayFirstIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export function CalendarMonthGrid({
  monthKey,
  occurrences,
  today,
  selectedDate,
  onSelectDay,
}: CalendarMonthGridProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const cells = useMemo<(DayCellData | null)[]>(() => {
    const { year, month } = parseMonthKey(monthKey);
    const total = daysInMonth(year, month);

    // Agrupar ocurrencias por día del mes (según scheduled_date).
    const byDay = new Map<number, RecurringExpenseOccurrence[]>();
    for (const occ of occurrences) {
      if (occ.scheduledDate.slice(0, 7) !== monthKey) continue;
      const day = Number(occ.scheduledDate.slice(8, 10));
      const list = byDay.get(day) ?? [];
      list.push(occ);
      byDay.set(day, list);
    }

    const leading = mondayFirstIndex(new Date(year, month, 1).getDay());
    const result: (DayCellData | null)[] = [];
    for (let i = 0; i < leading; i++) result.push(null);
    for (let day = 1; day <= total; day++) {
      const dateStr = toLocalDateString(new Date(year, month, day));
      const dayOccs = byDay.get(day) ?? [];
      const knownTotal = dayOccs.reduce(
        (sum, o) =>
          o.effectiveStatus !== 'skipped' && o.effectiveStatus !== 'cancelled' && o.projectedAmount != null
            ? sum + o.projectedAmount
            : sum,
        0
      );
      result.push({
        day,
        dateStr,
        statuses: dayOccs.map((o) => o.effectiveStatus),
        knownTotal,
      });
    }
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [monthKey, occurrences]);

  const rows: (DayCellData | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((wd) => (
          <Text key={wd} style={styles.weekday}>
            {wd}
          </Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((cell, ci) => (
            <CalendarDayCell
              key={ci}
              data={cell}
              isToday={cell?.dateStr === today}
              isSelected={cell?.dateStr === selectedDate}
              onPress={onSelectDay}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    weekRow: { flexDirection: 'row', marginBottom: 4 },
    weekday: { flex: 1, textAlign: 'center', fontSize: 11, color: theme.textMuted, fontWeight: '600' },
    row: { flexDirection: 'row', gap: 2, marginBottom: 2 },
  });
}
