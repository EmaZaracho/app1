import React, { useEffect, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useDb } from '../db/useDb';
import { getApiKey } from '../services/apiKey';
import { deleteMovementAndUnlinkOccurrence } from '../recurring/recurringPayment';
import { useHomeData } from '../hooks/useHomeData';
import { useMovementFilters } from '../hooks/useMovementFilters';
import { useMovementComposer } from '../hooks/useMovementComposer';
import { useReceiptScanner } from '../hooks/useReceiptScanner';
import { useMovementUndo } from '../hooks/useMovementUndo';
import { FundCarousel } from '../components/FundCarousel';
import { HomeActionMenu } from '../components/HomeActionMenu';
import { HomeAlerts } from '../components/HomeAlerts';
import { MovementFilterBar } from '../components/MovementFilterBar';
import { MovementList } from '../components/MovementList';
import { MovementPreview } from '../components/MovementPreview';
import { UndoBanner } from '../components/UndoBanner';
import { useTheme, type Theme } from '../theme';
import type { MainTabParamList, Movement, RootStackParamList } from '../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'HomeTab'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function HomeScreen({ navigation, route }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const aiInputRef = useRef<TextInput>(null);

  const homeData = useHomeData(db);
  const filters = useMovementFilters(homeData.movements);

  const fundNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const f of homeData.allFunds) map.set(f.id, f.name);
    return map;
  }, [homeData.allFunds]);

  const defaultFundId = useMemo(
    () => homeData.funds.find((f) => f.isDefault)?.id ?? null,
    [homeData.funds]
  );

  const activeSlide = homeData.slides[homeData.activeIndex];
  const context = useMemo(
    () =>
      activeSlide && activeSlide.kind === 'fund'
        ? ({ kind: 'fund', fundId: activeSlide.fund.id } as const)
        : ({ kind: 'total' } as const),
    [activeSlide]
  );

  const composer = useMovementComposer(db, homeData.funds, defaultFundId, homeData.reload);
  const undo = useMovementUndo(db, homeData.reload);
  const receiptScanner = useReceiptScanner((receipt) => navigation.navigate('ReceiptReview', { receipt }));

  // Movimiento borrado (con undo) recibido al volver de MovementDetail.
  useEffect(() => {
    const deleted = route.params?.deletedMovement;
    if (!deleted) return;
    const occId = route.params?.deletedOccurrenceId ?? null;
    navigation.setParams({ deletedMovement: undefined, deletedOccurrenceId: undefined });
    undo.showUndoBanner(deleted, occId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.deletedMovement, route.params?.deletedOccurrenceId, navigation]);

  // Filtro pedido por una pantalla externa (p. ej. "Ver movimientos" desde
  // Análisis financiero). No se auto-asigna nada: solo aplica lo recibido.
  useEffect(() => {
    const filter = route.params?.filter;
    if (!filter) return;
    navigation.setParams({ filter: undefined });
    filters.applyExternalFilter(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.filter, navigation]);

  async function handleSwipeDelete(movement: Movement) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const occId = await deleteMovementAndUnlinkOccurrence(db, movement.id);
    undo.showUndoBanner(movement, occId);
    await homeData.reload();
  }

  async function handleScanReceiptPress() {
    const geminiKey = await getApiKey('gemini');
    receiptScanner.startScan(geminiKey, () => {
      Alert.alert(
        'Necesitás Gemini',
        'Escanear facturas requiere una API key de Gemini configurada (DeepSeek no puede leer imágenes).',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ir a Configuración', onPress: () => navigation.navigate('MainTabs', { screen: 'SettingsTab' }) },
        ]
      );
    });
  }

  const displayError = composer.error ?? receiptScanner.error;

  return (
    <View style={styles.flex}>
      {!homeData.initialLoading && homeData.slides.length > 0 ? (
        <FundCarousel
          slides={homeData.slides}
          activeIndex={Math.min(homeData.activeIndex, homeData.slides.length - 1)}
          onIndexChange={homeData.selectSlide}
          onAddFund={() => navigation.navigate('FundEditor', undefined)}
        />
      ) : null}

      {!homeData.initialLoading ? (
        <HomeActionMenu
          onRegisterAI={() => aiInputRef.current?.focus()}
          onRegisterManual={() => navigation.navigate('MovementForm', { initialType: 'gasto' })}
          onScanReceipt={handleScanReceiptPress}
          onTransfer={() => navigation.navigate('MovementForm', { initialType: 'transferencia' })}
        />
      ) : null}

      {!homeData.initialLoading ? (
        <HomeAlerts
          hasApiKey={composer.hasApiKey}
          activeProvider={composer.activeProvider}
          budgetAlerts={homeData.budgetAlerts}
          onPressApiKey={() => navigation.navigate('MainTabs', { screen: 'SettingsTab' })}
          onPressBudget={() => navigation.navigate('Budgets')}
        />
      ) : null}

      <MovementFilterBar
        visible={!homeData.initialLoading && homeData.movements.length > 0}
        searchQuery={filters.searchQuery}
        onSearchChange={filters.setSearchQuery}
        filterType={filters.filterType}
        onFilterTypeChange={filters.setFilterType}
        hasAdvancedFilter={filters.hasAdvancedFilter}
        filterCategory={filters.filterCategory}
        onClearAdvanced={filters.clearAdvancedFilters}
      />

      <MovementList
        loading={homeData.initialLoading}
        movements={filters.filteredMovements}
        isFiltering={filters.isFiltering}
        context={context}
        fundNameById={fundNameById}
        onPressItem={(movementId) => navigation.navigate('MovementDetail', { movementId })}
        onSwipeDelete={handleSwipeDelete}
      />

      <UndoBanner visible={!!undo.undoMovement} onUndo={undo.handleUndo} />

      {displayError ? <Text style={styles.errorText}>{displayError}</Text> : null}

      <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
        {composer.preview ? (
        <MovementPreview
          key={composer.preview.key}
          initialType={composer.preview.type}
          initialAmountText={composer.preview.amountText}
          initialCategory={composer.preview.category}
          initialDescription={composer.preview.description}
          initialSourceFundId={composer.preview.sourceFundId}
          initialDestinationFundId={composer.preview.destinationFundId}
          rawText={composer.preview.rawText}
          funds={homeData.funds}
          defaultFundId={defaultFundId}
          onCancel={composer.handleCancelPreview}
          onConfirm={composer.handleConfirmPreview}
        />
      ) : (
        <View style={styles.inputRow}>
          <TextInput
            ref={aiInputRef}
            style={styles.input}
            placeholder='Ej: "pagué 20 de nafta con MP"'
            placeholderTextColor={theme.textMuted}
            value={composer.text}
            onChangeText={composer.setText}
            onSubmitEditing={composer.handleParse}
            editable={!composer.loading}
            returnKeyType="send"
          />
          <Pressable
            style={[styles.photoButton, receiptScanner.scanning && styles.buttonDisabled]}
            onPress={handleScanReceiptPress}
            disabled={receiptScanner.scanning || composer.loading}
          >
            {receiptScanner.scanning ? (
              <ActivityIndicator color={theme.text} />
            ) : (
              <Text style={styles.photoButtonText}>📷</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.addButton, composer.loading && styles.buttonDisabled]}
            onPress={composer.handleParse}
            disabled={composer.loading}
          >
            {composer.loading ? (
              <ActivityIndicator color={theme.primaryText} />
            ) : (
              <Text style={styles.addButtonText}>Agregar</Text>
            )}
          </Pressable>
        </View>
        )}
      </KeyboardStickyView>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    errorText: { color: theme.danger, paddingHorizontal: 16, paddingBottom: 4 },
    inputRow: {
      flexDirection: 'row',
      padding: 16,
      gap: 8,
      backgroundColor: theme.surface,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
    },
    photoButton: {
      backgroundColor: theme.surfaceAlt,
      borderRadius: 10,
      paddingHorizontal: 14,
      justifyContent: 'center',
      alignItems: 'center',
    },
    photoButtonText: { fontSize: 20 },
    addButton: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingHorizontal: 18,
      justifyContent: 'center',
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.5 },
    addButtonText: { color: theme.primaryText, fontWeight: '700' },
  });
}
