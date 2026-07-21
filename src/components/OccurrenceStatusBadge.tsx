import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import type { EffectiveOccurrenceStatus } from '../types/recurringExpenses';

/** Etiqueta + forma por estado: nunca solo color (accesibilidad). */
export const STATUS_META: Record<EffectiveOccurrenceStatus, { label: string; icon: string }> = {
  pending: { label: 'Pendiente', icon: '○' },
  overdue: { label: 'Vencido', icon: '!' },
  paid: { label: 'Pagado', icon: '✓' },
  skipped: { label: 'Omitido', icon: '–' },
  cancelled: { label: 'Cancelado', icon: '✕' },
};

export function statusColor(status: EffectiveOccurrenceStatus, theme: Theme): string {
  switch (status) {
    case 'paid':
      return theme.success;
    case 'overdue':
      return theme.danger;
    case 'pending':
      return theme.primary;
    case 'skipped':
    case 'cancelled':
      return theme.textMuted;
  }
}

export function OccurrenceStatusBadge({ status }: { status: EffectiveOccurrenceStatus }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const color = statusColor(status, theme);
  const meta = STATUS_META[status];
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[styles.text, { color }]}>
        {meta.icon} {meta.label}
      </Text>
    </View>
  );
}

function createStyles(_theme: Theme) {
  return StyleSheet.create({
    badge: {
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    text: { fontSize: 11, fontWeight: '700' },
  });
}
