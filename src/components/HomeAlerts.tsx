import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme, type Theme } from '../theme';
import { AI_PROVIDERS, type AIProvider } from '../types';
import type { BudgetAlert } from '../db/database';

interface HomeAlertsProps {
  hasApiKey: boolean;
  activeProvider: AIProvider;
  budgetAlerts: BudgetAlert[];
  onPressApiKey: () => void;
  onPressBudget: () => void;
}

/** Banners de Inicio: falta API key (solo bloquea el flujo de IA) y presupuestos superados. */
export function HomeAlerts({ hasApiKey, activeProvider, budgetAlerts, onPressApiKey, onPressBudget }: HomeAlertsProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const providerLabel = AI_PROVIDERS.find((p) => p.id === activeProvider)?.label ?? activeProvider;

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
        <Pressable style={styles.budgetAlertBanner} onPress={onPressBudget}>
          <Text style={styles.budgetAlertText}>
            Superaste el presupuesto de {budgetAlerts.map((a) => a.category).join(', ')} este mes. Tocá acá
            para revisarlo.
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    apiKeyBanner: { backgroundColor: theme.warningBg, paddingHorizontal: 16, paddingVertical: 10 },
    apiKeyBannerText: { color: theme.warningText, fontSize: 13 },
    budgetAlertBanner: { backgroundColor: theme.dangerBg, paddingHorizontal: 16, paddingVertical: 10 },
    budgetAlertText: { color: theme.dangerText, fontSize: 13 },
  });
}
