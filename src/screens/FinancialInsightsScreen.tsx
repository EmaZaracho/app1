import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDb } from '../db/useDb';
import { useTheme, type Theme } from '../theme';
import { buildFinancialSnapshot } from '../analytics/financialSnapshot';
import { computeSnapshotHash } from '../analytics/snapshotHash';
import { getSavingsGoal, setSavingsGoal } from '../db/financialPreferencesRepository';
import { getCategoryPriorities } from '../db/categoryFinancialSettingsRepository';
import {
  dismissRecommendation as dismissRecommendationInDb,
  getCachedAdvice,
  saveCachedAdvice,
} from '../db/financialAdviceCacheRepository';
import { getApiKey, getSelectedProvider } from '../services/apiKey';
import { AIProviderError, generateFinancialAdvice } from '../services/financialAdvice';
import { buildAdviceInputFromSnapshot } from '../types/financialAdvice';
import { PeriodSelector } from '../components/PeriodSelector';
import { SavingsGoalCard } from '../components/SavingsGoalCard';
import { FinancialMetricsGrid } from '../components/FinancialMetricsGrid';
import { CategoryOpportunityCard } from '../components/CategoryOpportunityCard';
import { DeterministicFindingCard } from '../components/DeterministicFindingCard';
import { RecommendationCard } from '../components/RecommendationCard';
import { AI_PROVIDERS, type AIProvider, type RootStackParamList } from '../types';
import type { AnalysisPeriodPreset, FinancialSnapshot, SavingsGoal } from '../types/financialAnalytics';
import type { AdviceRecommendation, FinancialAdvice } from '../types/financialAdvice';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function parseCustomDate(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

export default function FinancialInsightsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const navigation = useNavigation<Nav>();

  const [preset, setPreset] = useState<AnalysisPeriodPreset>('current_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);

  const [snapshot, setSnapshot] = useState<FinancialSnapshot | null>(null);
  const [savingsGoalConfig, setSavingsGoalConfig] = useState<SavingsGoal>({
    enabled: false,
    mode: 'fixed_amount',
    targetValue: 0,
  });
  const [loadingSnapshot, setLoadingSnapshot] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);

  const [advice, setAdvice] = useState<FinancialAdvice | null>(null);
  const [adviceStale, setAdviceStale] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [provider, setProvider] = useState<AIProvider>('deepseek');
  const [hasApiKey, setHasApiKey] = useState(true);

  // Evita aplicar resultados de una solicitud vieja si el período cambió mientras esperaba.
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const loadSnapshot = useCallback(async () => {
    const myRequestId = ++requestIdRef.current;
    setLoadingSnapshot(true);
    setSnapshotError(null);
    setAdviceStale(false);

    let custom: { start: Date; end: Date } | undefined;
    if (preset === 'custom') {
      const start = parseCustomDate(customStart);
      const end = parseCustomDate(customEnd);
      if (!start || !end) {
        setCustomError('Ingresá ambas fechas en formato AAAA-MM-DD.');
        setLoadingSnapshot(false);
        return;
      }
      if (start.getTime() > end.getTime()) {
        setCustomError('La fecha inicial debe ser anterior o igual a la fecha final.');
        setLoadingSnapshot(false);
        return;
      }
      setCustomError(null);
      custom = { start, end };
    }

    try {
      const [snap, goal, selectedProvider] = await Promise.all([
        buildFinancialSnapshot(db, { preset, custom }),
        getSavingsGoal(db),
        getSelectedProvider(),
      ]);
      if (!mountedRef.current || myRequestId !== requestIdRef.current) return;

      const key = await getApiKey(selectedProvider);
      if (!mountedRef.current || myRequestId !== requestIdRef.current) return;

      setSnapshot(snap);
      setSavingsGoalConfig(goal);
      setProvider(selectedProvider);
      setHasApiKey(!!key);

      const priorities = await getCategoryPriorities(db);
      if (!mountedRef.current || myRequestId !== requestIdRef.current) return;
      const hash = computeSnapshotHash(
        snap,
        selectedProvider,
        Object.fromEntries(priorities.map((p) => [p.category, p.priority])),
        goal
      );
      const cached = await getCachedAdvice(db);
      if (!mountedRef.current || myRequestId !== requestIdRef.current) return;

      if (cached && cached.snapshotHash === hash) {
        setAdvice(cached.advice);
        setAdviceStale(false);
      } else {
        setAdvice(cached?.advice ?? null);
        setAdviceStale(!!cached);
      }
    } catch (err) {
      if (!mountedRef.current || myRequestId !== requestIdRef.current) return;
      setSnapshotError(err instanceof Error ? err.message : 'No se pudieron calcular las métricas.');
    } finally {
      if (mountedRef.current && myRequestId === requestIdRef.current) setLoadingSnapshot(false);
    }
  }, [db, preset, customStart, customEnd]);

  useFocusEffect(
    useCallback(() => {
      loadSnapshot();
    }, [loadSnapshot])
  );

  async function handleSaveSavingsGoal(goal: SavingsGoal) {
    await setSavingsGoal(db, goal);
    setSavingsGoalConfig(goal);
    await loadSnapshot();
  }

  async function handleGenerate() {
    if (!snapshot) return;
    const myRequestId = ++requestIdRef.current;
    setGenerating(true);
    setGenerateError(null);
    try {
      const key = await getApiKey(provider);
      if (!key) {
        if (myRequestId === requestIdRef.current) {
          setGenerateError(
            `Configurá tu API key de ${AI_PROVIDERS.find((p) => p.id === provider)?.label ?? provider} en Configuración.`
          );
        }
        return;
      }
      const input = buildAdviceInputFromSnapshot(snapshot);
      const result = await generateFinancialAdvice(input, provider, key);
      if (!mountedRef.current || myRequestId !== requestIdRef.current) return;

      const priorities = await getCategoryPriorities(db);
      if (!mountedRef.current || myRequestId !== requestIdRef.current) return;
      const hash = computeSnapshotHash(
        snapshot,
        provider,
        Object.fromEntries(priorities.map((p) => [p.category, p.priority])),
        savingsGoalConfig
      );
      await saveCachedAdvice(db, {
        periodPreset: snapshot.period.preset,
        periodStart: snapshot.period.start,
        periodEnd: snapshot.period.end,
        provider,
        snapshotHash: hash,
        snapshotJson: JSON.stringify(input),
        advice: result,
      });
      if (!mountedRef.current || myRequestId !== requestIdRef.current) return;
      setAdvice(result);
      setAdviceStale(false);
    } catch (err) {
      if (!mountedRef.current || myRequestId !== requestIdRef.current) return;
      setGenerateError(err instanceof AIProviderError ? err.message : 'No se pudo generar el análisis.');
    } finally {
      if (mountedRef.current && myRequestId === requestIdRef.current) setGenerating(false);
    }
  }

  async function handleDismiss(rec: AdviceRecommendation) {
    const updated = await dismissRecommendationInDb(db, rec.id);
    if (updated) setAdvice(updated.advice);
  }

  function handleAction(rec: AdviceRecommendation) {
    if (rec.actionType === 'create_budget') {
      navigation.navigate('Budgets');
    } else if (rec.actionType === 'configure_savings_goal') {
      Alert.alert('Configurar meta', 'Usá la tarjeta "Meta de ahorro" más arriba para configurarla.');
    } else if (rec.actionType === 'view_movements' && snapshot) {
      navigation.navigate('Home', {
        filter: {
          type: 'gasto',
          category: rec.relatedCategory ?? undefined,
          periodStart: snapshot.period.start,
          periodEnd: snapshot.period.end,
        },
      });
    }
  }

  const visibleRecommendations = (advice?.recommendations ?? []).filter((r) => !r.dismissed);
  const showingCurrentAdvice = !!advice && !adviceStale;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>Período</Text>
      <PeriodSelector
        preset={preset}
        onSelectPreset={setPreset}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
        customError={customError}
      />

      {loadingSnapshot ? (
        <ActivityIndicator style={styles.loader} color={theme.primary} />
      ) : snapshotError ? (
        <Text style={styles.errorText}>{snapshotError}</Text>
      ) : snapshot ? (
        <>
          <Text style={styles.periodLabel}>
            {snapshot.period.label} · {new Date(snapshot.period.start).toLocaleDateString('es-AR')} al{' '}
            {new Date(new Date(snapshot.period.end).getTime() - 1).toLocaleDateString('es-AR')}
          </Text>

          <View style={styles.section}>
            <SavingsGoalCard goal={savingsGoalConfig} status={snapshot.savingsGoal} onSave={handleSaveSavingsGoal} />
          </View>

          {snapshot.dataQuality.message ? (
            <Text style={styles.dataQualityText}>{snapshot.dataQuality.message}</Text>
          ) : null}

          <Text style={styles.sectionTitle}>Métricas</Text>
          <FinancialMetricsGrid snapshot={snapshot} />

          {snapshot.categoryExpenses.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Gastos por categoría</Text>
              {snapshot.categoryExpenses.map((c) => (
                <CategoryOpportunityCard key={c.category} item={c} />
              ))}
            </>
          ) : null}

          {snapshot.deterministicFindings.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>Hallazgos</Text>
              {snapshot.deterministicFindings.map((f) => (
                <DeterministicFindingCard key={f.code + (f.relatedCategory ?? '')} finding={f} />
              ))}
            </>
          ) : null}

          <Text style={styles.sectionTitle}>Recomendaciones</Text>

          {!hasApiKey ? (
            <Text style={styles.infoText}>
              Configurá una API key de IA en Configuración para generar recomendaciones personalizadas.
            </Text>
          ) : null}

          {showingCurrentAdvice && advice ? (
            <>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryText}>{advice.summary}</Text>
                {advice.strengths.map((s, i) => (
                  <Text key={i} style={styles.strengthText}>
                    ✓ {s.title} — {s.evidence}
                  </Text>
                ))}
              </View>
              {visibleRecommendations.length > 0 ? (
                visibleRecommendations.map((r) => (
                  <RecommendationCard key={r.id} recommendation={r} onAction={handleAction} onDismiss={handleDismiss} />
                ))
              ) : (
                <Text style={styles.infoText}>No quedan recomendaciones activas para este análisis.</Text>
              )}
              <Text style={styles.metaText}>
                Generado con {AI_PROVIDERS.find((p) => p.id === provider)?.label ?? provider}.
              </Text>
              <Text style={styles.disclaimerText}>{advice.disclaimer}</Text>
            </>
          ) : (
            <>
              {adviceStale ? (
                <Text style={styles.infoText}>
                  Las recomendaciones guardadas quedaron desactualizadas porque cambiaron los datos. Generá un
                  análisis nuevo.
                </Text>
              ) : null}
              <Text style={styles.privacyText}>
                Para generar recomendaciones se enviarán al proveedor de IA únicamente totales y métricas
                agregadas. No se enviarán descripciones ni movimientos individuales.
              </Text>
            </>
          )}

          {generateError ? <Text style={styles.errorText}>{generateError}</Text> : null}

          <Pressable
            style={[styles.generateButton, (generating || !hasApiKey) && styles.buttonDisabled]}
            onPress={handleGenerate}
            disabled={generating || !hasApiKey}
          >
            {generating ? (
              <ActivityIndicator color={theme.primaryText} />
            ) : (
              <Text style={styles.generateButtonText}>{showingCurrentAdvice ? 'Regenerar' : 'Generar recomendaciones'}</Text>
            )}
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    container: { padding: 16, paddingBottom: 48 },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginTop: 20, marginBottom: 10 },
    periodLabel: { fontSize: 12, color: theme.textMuted, marginTop: 10 },
    section: { marginTop: 16 },
    loader: { marginTop: 40 },
    errorText: { color: theme.danger, fontSize: 13, marginTop: 12 },
    dataQualityText: {
      color: theme.warningText,
      fontSize: 12,
      marginTop: 10,
      backgroundColor: theme.warningBg,
      padding: 10,
      borderRadius: 8,
    },
    infoText: { color: theme.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 8 },
    summaryCard: { backgroundColor: theme.surfaceAlt, borderRadius: 12, padding: 14, marginBottom: 12 },
    summaryText: { fontSize: 14, color: theme.text, lineHeight: 20 },
    strengthText: { fontSize: 12, color: theme.success, marginTop: 8 },
    metaText: { fontSize: 11, color: theme.textMuted, marginTop: 4 },
    disclaimerText: { fontSize: 11, color: theme.textMuted, marginTop: 8, fontStyle: 'italic' },
    privacyText: { fontSize: 12, color: theme.textSecondary, marginTop: 8, marginBottom: 4, lineHeight: 17 },
    generateButton: {
      backgroundColor: theme.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 16,
    },
    buttonDisabled: { opacity: 0.5 },
    generateButtonText: { color: theme.primaryText, fontWeight: '700', fontSize: 15 },
  });
}
