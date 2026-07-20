import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  adjustFundBalance,
  createFund,
  getAliasesForFund,
  getFundById,
  setDefaultFund,
  setFundAliases,
  updateFund,
} from '../db/fundsRepo';
import { getFundBalance } from '../db/balances';
import { useDb } from '../db/useDb';
import { FUND_COLORS, FUND_ICONS, DEFAULT_FUND_COLOR, DEFAULT_FUND_ICON } from '../fundVisuals';
import { formatCurrency } from '../utils/format';
import { useTheme, type Theme } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'FundEditor'>;

export default function FundEditorScreen({ route, navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const fundId = route.params?.fundId;
  const isEdit = fundId != null;

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string>(DEFAULT_FUND_ICON);
  const [color, setColor] = useState<string>(DEFAULT_FUND_COLOR);
  const [aliases, setAliases] = useState<string[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [initialBalance, setInitialBalance] = useState('');
  const [currentBalance, setCurrentBalance] = useState(0);
  const [newBalance, setNewBalance] = useState('');
  const [saving, setSaving] = useState(false);
  const [androidKeyboardHeight, setAndroidKeyboardHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  // El botón atrás de Android oculta el teclado sin sacarle el foco al input,
  // así que "onFocus" no alcanza para saber cuándo volver a hacer scroll: hay
  // que reaccionar a cada aparición real del teclado (keyboardDidShow).
  const balanceFieldFocusedRef = useRef(false);

  useEffect(() => {
    navigation.setOptions({ title: isEdit ? 'Editar fondo' : 'Nuevo fondo' });
  }, [navigation, isEdit]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setAndroidKeyboardHeight(e.endCoordinates?.height ?? 0);
      if (balanceFieldFocusedRef.current) {
        scrollRef.current?.scrollToEnd({ animated: true });
      }
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setAndroidKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (fundId == null) return;
    (async () => {
      const [fund, fundAliases, balance] = await Promise.all([
        getFundById(db, fundId),
        getAliasesForFund(db, fundId),
        getFundBalance(db, fundId),
      ]);
      if (!fund) return;
      setName(fund.name);
      setIcon(fund.icon);
      setColor(fund.color);
      setIsDefault(fund.isDefault);
      setAliases(fundAliases.map((a) => a.alias));
      setCurrentBalance(balance);
      setNewBalance(String(balance));
    })();
  }, [db, fundId]);

  function updateAlias(index: number, value: string) {
    setAliases((prev) => prev.map((a, i) => (i === index ? value : a)));
  }
  function removeAlias(index: number) {
    setAliases((prev) => prev.filter((_, i) => i !== index));
  }
  function addAlias() {
    setAliases((prev) => [...prev, '']);
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('Falta el nombre', 'Ingresá un nombre para el fondo.');
      return;
    }
    setSaving(true);
    try {
      const cleanAliases = aliases.map((a) => a.trim()).filter(Boolean);
      if (isEdit && fundId != null) {
        await updateFund(db, fundId, { name: name.trim(), icon, color });
        await setFundAliases(db, fundId, cleanAliases);
        if (isDefault) await setDefaultFund(db, fundId);
      } else {
        const parsedInitial = Number(initialBalance.replace(',', '.'));
        await createFund(db, {
          name: name.trim(),
          icon,
          color,
          aliases: cleanAliases,
          isDefault,
          initialBalance: Number.isFinite(parsedInitial) ? parsedInitial : 0,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch (err) {
      Alert.alert('No se pudo guardar', err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAdjust() {
    const parsed = Number(newBalance.replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      Alert.alert('Saldo inválido', 'Ingresá un número válido.');
      return;
    }
    if (Math.abs(parsed - currentBalance) < 0.005) {
      Alert.alert('Sin cambios', 'El nuevo saldo es igual al actual.');
      return;
    }
    try {
      await adjustFundBalance(db, fundId!, parsed);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const balance = await getFundBalance(db, fundId!);
      setCurrentBalance(balance);
      setNewBalance(String(balance));
      Alert.alert('Saldo ajustado', `Nuevo saldo: ${formatCurrency(balance)}.`);
    } catch (err) {
      Alert.alert('No se pudo ajustar', err instanceof Error ? err.message : 'Error inesperado.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[
          styles.container,
          Platform.OS === 'android' && { paddingBottom: 60 + androidKeyboardHeight },
        ]}
        keyboardShouldPersistTaps="handled"
      >
      <Text style={styles.label}>Nombre</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Ej: Mercado Pago"
        placeholderTextColor={theme.textMuted}
      />

      <Text style={styles.label}>Icono</Text>
      <View style={styles.iconRow}>
        {FUND_ICONS.map((emoji) => (
          <Pressable
            key={emoji}
            style={[styles.iconChip, icon === emoji && { borderColor: color, backgroundColor: theme.surfaceAlt }]}
            onPress={() => setIcon(emoji)}
          >
            <Text style={styles.iconEmoji}>{emoji}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Color</Text>
      <View style={styles.colorRow}>
        {FUND_COLORS.map((c) => (
          <Pressable
            key={c}
            style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.colorSelected]}
            onPress={() => setColor(c)}
          />
        ))}
      </View>

      <Text style={styles.label}>Alias</Text>
      <Text style={styles.hint}>
        Otros nombres con los que te referís a este fondo (ej: MP, cash). Ayudan a la IA a
        identificarlo.
      </Text>
      {aliases.map((alias, i) => (
        <View key={i} style={styles.aliasRow}>
          <TextInput
            style={[styles.input, styles.aliasInput]}
            value={alias}
            onChangeText={(v) => updateAlias(i, v)}
            placeholder="Alias"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
          />
          <Pressable style={styles.aliasRemove} onPress={() => removeAlias(i)}>
            <Text style={styles.aliasRemoveText}>✕</Text>
          </Pressable>
        </View>
      ))}
      <Pressable style={styles.addAliasButton} onPress={addAlias}>
        <Text style={styles.addAliasText}>+ Agregar alias</Text>
      </Pressable>

      <View style={styles.switchRow}>
        <Text style={styles.label}>Fondo predeterminado</Text>
        <Switch
          value={isDefault}
          onValueChange={setIsDefault}
          trackColor={{ true: theme.primary, false: theme.border }}
        />
      </View>

      {!isEdit ? (
        <>
          <Text style={styles.label}>Saldo inicial (opcional)</Text>
          <TextInput
            style={styles.input}
            value={initialBalance}
            onChangeText={setInitialBalance}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={theme.textMuted}
          />
        </>
      ) : null}

      <Pressable
        style={[styles.saveButton, saving && styles.disabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>{isEdit ? 'Guardar cambios' : 'Crear fondo'}</Text>
      </Pressable>

      {isEdit ? (
        <View style={styles.adjustSection}>
          <Text style={styles.sectionTitle}>Ajustar saldo</Text>
          <Text style={styles.hint}>
            Saldo actual: {formatCurrency(currentBalance)}. Ingresá el saldo real deseado y se
            registrará un ajuste por la diferencia.
          </Text>
          <View style={styles.adjustRow}>
            <TextInput
              style={[styles.input, styles.adjustInput]}
              value={newBalance}
              onChangeText={setNewBalance}
              keyboardType="numbers-and-punctuation"
              placeholder="Nuevo saldo"
              placeholderTextColor={theme.textMuted}
              onFocus={() => {
                balanceFieldFocusedRef.current = true;
                scrollRef.current?.scrollToEnd({ animated: true });
              }}
              onBlur={() => {
                balanceFieldFocusedRef.current = false;
              }}
            />
            <Pressable style={styles.adjustButton} onPress={handleAdjust}>
              <Text style={styles.adjustButtonText}>Ajustar</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    flex: { flex: 1, backgroundColor: theme.bg },
    container: { padding: 20, paddingBottom: 60 },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 8, marginTop: 16, color: theme.text },
    hint: { fontSize: 12, color: theme.textSecondary, marginBottom: 8, lineHeight: 17 },
    input: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface,
      color: theme.text,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 16,
    },
    iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    iconChip: {
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 12,
      width: 46,
      height: 46,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconEmoji: { fontSize: 22 },
    colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    colorSwatch: { width: 34, height: 34, borderRadius: 17 },
    colorSelected: { borderWidth: 3, borderColor: theme.text },
    aliasRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    aliasInput: { flex: 1 },
    aliasRemove: { padding: 8 },
    aliasRemoveText: { color: theme.danger, fontSize: 16, fontWeight: '700' },
    addAliasButton: { paddingVertical: 8 },
    addAliasText: { color: theme.primary, fontWeight: '600' },
    switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    saveButton: {
      backgroundColor: theme.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 24,
    },
    disabled: { opacity: 0.6 },
    saveButtonText: { color: theme.primaryText, fontWeight: '700', fontSize: 16 },
    adjustSection: {
      marginTop: 32,
      paddingTop: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.text, marginBottom: 8 },
    adjustRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    adjustInput: { flex: 1 },
    adjustButton: {
      backgroundColor: theme.chipSelectedBg,
      borderRadius: 10,
      paddingHorizontal: 18,
      paddingVertical: 12,
      justifyContent: 'center',
    },
    adjustButtonText: { color: theme.chipSelectedText, fontWeight: '700' },
  });
}
