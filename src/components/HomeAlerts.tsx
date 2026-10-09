import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { AI_PROVIDERS, type AIProvider } from '../types';
import { BUDGET_PERIOD_CURRENT } from '../domain/budgetPeriod';
import { formatCurrency } from '../utils/format';
import type { BudgetProgress } from '../db/database';

/** Cuántos presupuestos se detallan en Inicio; el resto se resume en una línea. */
const MAX_VISIBLE_BUDGETS = 3;

interface HomeAlertsProps {
  hasApiKey: boolean;
  activeProvider: AIProvider;
  budgetAlerts: BudgetProgress[];
  onPressApiKey: () => void;
  onPressBudget: () => void;
}

/** Banners de Inicio: falta API key (solo bloquea el flujo de IA) y presupuestos por agotarse o superados. */
export function HomeAlerts({ hasApiKey, activeProvider, budgetAlerts, onPressApiKey, onPressBudget }: HomeAlertsProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const providerLabel = AI_PROVIDERS.find((p) => p.id === activeProvider)?.label ?? activeProvider;
  const visibleBudgets = budgetAlerts.slice(0, MAX_VISIBLE_BUDGETS);
  const hiddenBudgets = budgetAlerts.length - visibleBudgets.length;

  return (
    <>
      {!hasApiKey ? (
        <Pressable style={styles.apiKeyBanner} onPress={onPressApiKey}>
          <Text style={styles.apiKeyBannerText}>
            Configurá tu API key de {providerLabel} para poder agregar movimientos con IA. Tocá acá para ir a
            Configuración.
          </Text>
        </Pressable>
      ) : null}

      {budgetAlerts.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Revisar presupuestos"
          style={[
            styles.budgetBanner,
            budgetAlerts.some((a) => a.status === 'exceeded') ? styles.budgetBannerExceeded : styles.budgetBannerNear,
          ]}
          onPress={onPressBudget}
        >
          {visibleBudgets.map((alert) => {
            const exceeded = alert.status === 'exceeded';
            const textStyle = exceeded ? styles.exceededText : styles.nearText;
            return (
              <View key={alert.category} style={styles.budgetRow}>
                <Text style={[styles.budgetTitle, textStyle]}>
                  {exceeded ? 'Superaste' : 'Cerca del límite:'} {alert.category}
                </Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${Math.min(alert.ratio, 1) * 100}%`,
                        backgroundColor: exceeded ? theme.danger : theme.warning,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.budgetDetail, textStyle]}>
                  {formatCurrency(alert.spent)} de {formatCurrency(alert.limit)} {BUDGET_PERIOD_CURRENT[alert.period]}{' '}
                  ({Math.round(alert.ratio * 100)}%)
                </Text>
              </View>
            );
          })}
          {hiddenBudgets > 0 ? (
            <Text style={[styles.budgetDetail, styles.moreText]}>
              y {hiddenBudgets} {hiddenBudgets === 1 ? 'presupuesto más' : 'presupuestos más'}. Tocá para revisarlos.
            </Text>
          ) : null}
        </Pressable>
      ) : null}
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    apiKeyBanner: { backgroundColor: theme.warningBg, paddingHorizontal: 16, paddingVertical: 10 },
    apiKeyBannerText: { color: theme.warningText, fontSize: 13 },
    budgetBanner: { paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
    budgetBannerExceeded: { backgroundColor: theme.dangerBg },
    budgetBannerNear: { backgroundColor: theme.warningBg },
    budgetRow: { gap: 4 },
    budgetTitle: { fontSize: 13, fontWeight: '600' },
    budgetDetail: { fontSize: 12 },
    exceededText: { color: theme.dangerText },
    nearText: { color: theme.warningText },
    moreText: { color: theme.textSecondary },
    barTrack: { height: 6, borderRadius: 3, backgroundColor: theme.surfaceAlt, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 3 },
  });
}
