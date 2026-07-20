import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { formatCurrency } from '../utils/format';
import type { AdviceRecommendation } from '../types/financialAdvice';

const PRIORITY_LABEL = { high: 'Alta', medium: 'Media', low: 'Baja' } as const;

const ACTION_LABEL: Partial<Record<AdviceRecommendation['actionType'], string>> = {
  create_budget: 'Crear presupuesto',
  configure_savings_goal: 'Configurar meta',
  view_movements: 'Ver movimientos',
};

interface RecommendationCardProps {
  recommendation: AdviceRecommendation;
  onAction: (rec: AdviceRecommendation) => void;
  onDismiss: (rec: AdviceRecommendation) => void;
}

export function RecommendationCard({ recommendation, onAction, onDismiss }: RecommendationCardProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const actionLabel = ACTION_LABEL[recommendation.actionType];

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{recommendation.title}</Text>
        <Text style={styles.priorityTag}>{PRIORITY_LABEL[recommendation.priority]}</Text>
      </View>
      <Text style={styles.reason}>{recommendation.reason}</Text>
      <Text style={styles.action}>{recommendation.action}</Text>
      {recommendation.potentialSavings ? (
        <Text style={styles.savings}>Ahorro potencial: hasta {formatCurrency(recommendation.potentialSavings)}</Text>
      ) : null}
      <View style={styles.footerRow}>
        <Pressable onPress={() => onDismiss(recommendation)}>
          <Text style={styles.dismissText}>Descartar</Text>
        </Pressable>
        {actionLabel ? (
          <Pressable style={styles.actionButton} onPress={() => onAction(recommendation)}>
            <Text style={styles.actionButtonText}>{actionLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
    title: { fontSize: 15, fontWeight: '700', color: theme.text, flex: 1 },
    priorityTag: { fontSize: 11, color: theme.primary, fontWeight: '700', textTransform: 'uppercase' },
    reason: { fontSize: 13, color: theme.textSecondary, marginTop: 6 },
    action: { fontSize: 13, color: theme.text, marginTop: 6, fontWeight: '600' },
    savings: { fontSize: 12, color: theme.success, marginTop: 8, fontWeight: '600' },
    footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
    dismissText: { color: theme.textMuted, fontSize: 13, fontWeight: '600' },
    actionButton: { backgroundColor: theme.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    actionButtonText: { color: theme.primaryText, fontWeight: '700', fontSize: 13 },
  });
}
