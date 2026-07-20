import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import type { DeterministicFinding } from '../types/financialAnalytics';

export function DeterministicFindingCard({ finding }: { finding: DeterministicFinding }) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const color =
    finding.severity === 'critical' ? theme.danger : finding.severity === 'warning' ? theme.warning : theme.primary;
  const icon = finding.severity === 'critical' ? '🔴' : finding.severity === 'warning' ? '🟡' : 'ℹ️';

  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <Text style={styles.title}>
        {icon} {finding.title}
      </Text>
      <Text style={styles.evidence}>{finding.evidence}</Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    card: {
      backgroundColor: theme.surface,
      borderRadius: 10,
      padding: 12,
      marginBottom: 8,
      borderLeftWidth: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
    },
    title: { fontSize: 14, fontWeight: '700', color: theme.text },
    evidence: { fontSize: 13, color: theme.textSecondary, marginTop: 4 },
  });
}
