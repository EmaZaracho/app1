import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  archiveFund,
  deleteFund,
  getFundsWithBalances,
  setDefaultFund,
  unarchiveFund,
} from '../db/fundsRepo';
import { useDb } from '../db/useDb';
import { formatCurrency } from '../utils/format';
import { useTheme, type Theme } from '../theme';
import type { FundWithBalance, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Funds'>;

export default function FundsScreen({ navigation }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const [funds, setFunds] = useState<FundWithBalance[]>([]);

  const load = useCallback(async () => {
    const list = await getFundsWithBalances(db, true);
    setFunds(list);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function run(action: () => Promise<void>) {
    try {
      await action();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await load();
    } catch (err) {
      Alert.alert('No se pudo completar', err instanceof Error ? err.message : 'Error inesperado.');
    }
  }

  function confirmDelete(fund: FundWithBalance) {
    Alert.alert('Eliminar fondo', `¿Eliminar "${fund.name}"? Esta acción no se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: () => run(() => deleteFund(db, fund.id)) },
    ]);
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.addButton}
        onPress={() => navigation.navigate('FundEditor', undefined)}
      >
        <Text style={styles.addButtonText}>+ Agregar fondo</Text>
      </Pressable>

      <FlatList
        data={funds}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={[styles.card, item.isArchived && styles.cardArchived]}>
            <Pressable
              style={styles.cardMain}
              onPress={() => navigation.navigate('FundEditor', { fundId: item.id })}
            >
              <Text style={styles.icon}>{item.icon}</Text>
              <View style={styles.flex}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.name}</Text>
                  {item.isDefault ? <Text style={styles.defaultTag}>Predet.</Text> : null}
                  {item.isArchived ? <Text style={styles.archivedTag}>Archivado</Text> : null}
                </View>
                <Text style={[styles.balance, item.balance < 0 && { color: theme.danger }]}>
                  {formatCurrency(item.balance)}
                </Text>
                {item.aliases.length > 0 ? (
                  <Text style={styles.aliases}>{item.aliases.map((a) => a.alias).join(', ')}</Text>
                ) : null}
              </View>
              <View style={[styles.colorBar, { backgroundColor: item.color }]} />
            </Pressable>

            <View style={styles.actionsRow}>
              {!item.isArchived && !item.isDefault ? (
                <Pressable style={styles.action} onPress={() => run(() => setDefaultFund(db, item.id))}>
                  <Text style={styles.actionText}>★ Predeterminado</Text>
                </Pressable>
              ) : null}
              {item.isArchived ? (
                <Pressable style={styles.action} onPress={() => run(() => unarchiveFund(db, item.id))}>
                  <Text style={styles.actionText}>Desarchivar</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.action} onPress={() => run(() => archiveFund(db, item.id))}>
                  <Text style={styles.actionText}>Archivar</Text>
                </Pressable>
              )}
              <Pressable style={styles.action} onPress={() => confirmDelete(item)}>
                <Text style={[styles.actionText, { color: theme.danger }]}>Eliminar</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    flex: { flex: 1 },
    addButton: {
      backgroundColor: theme.primary,
      margin: 16,
      marginBottom: 0,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
    },
    addButtonText: { color: theme.primaryText, fontWeight: '700', fontSize: 15 },
    listContent: { padding: 16 },
    card: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      overflow: 'hidden',
    },
    cardArchived: { opacity: 0.7 },
    cardMain: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
    icon: { fontSize: 26 },
    nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    name: { fontSize: 16, fontWeight: '700', color: theme.text },
    defaultTag: {
      fontSize: 10,
      color: theme.primary,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    archivedTag: { fontSize: 10, color: theme.textMuted, fontWeight: '700', textTransform: 'uppercase' },
    balance: { fontSize: 18, fontWeight: '700', color: theme.text, marginTop: 2 },
    aliases: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
    colorBar: { width: 6, alignSelf: 'stretch', borderRadius: 3 },
    actionsRow: {
      flexDirection: 'row',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.border,
    },
    action: {
      flex: 1,
      paddingVertical: 10,
      alignItems: 'center',
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: theme.border,
    },
    actionText: { fontSize: 13, color: theme.primary, fontWeight: '600' },
  });
}
