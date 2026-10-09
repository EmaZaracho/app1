import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FormScrollView } from '../components/FormScrollView';
import { useDb } from '../db/useDb';
import {
  addCategoryKeyword,
  getCategoryKeywords,
  MAX_KEYWORD_LENGTH,
  removeCategoryKeyword,
  type CategoryKeyword,
} from '../db/categoryKeywordsRepo';
import { iconForCategory } from '../categoryVisuals';
import { useTheme, type Theme } from '../theme';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from '../types';

export default function CategoryKeywordsScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const db = useDb();
  const [keywords, setKeywords] = useState<CategoryKeyword[]>([]);
  const [drafts, setDrafts] = useState<Partial<Record<ExpenseCategory, string>>>({});
  const [errors, setErrors] = useState<Partial<Record<ExpenseCategory, string>>>({});

  const load = useCallback(async () => {
    setKeywords(await getCategoryKeywords(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function handleAdd(category: ExpenseCategory) {
    const result = await addCategoryKeyword(db, category, drafts[category] ?? '');
    if (!result.ok) {
      setErrors((prev) => ({ ...prev, [category]: result.error }));
      return;
    }
    setErrors((prev) => ({ ...prev, [category]: undefined }));
    setDrafts((prev) => ({ ...prev, [category]: '' }));
    await load();
  }

  async function handleRemove(keyword: string) {
    await removeCategoryKeyword(db, keyword);
    await load();
  }

  return (
    <View style={styles.container}>
      <FormScrollView style={styles.container} contentContainerStyle={styles.listContent}>
        <Text style={styles.intro}>
          Definí palabras que identifican una categoría de gasto, por ejemplo “delivery” en Ocio. Al
          interpretar un movimiento con IA, si el texto la menciona, se prefiere esa categoría. Tocá una
          palabra para quitarla.
        </Text>
        {EXPENSE_CATEGORIES.map((category) => {
          const words = keywords.filter((k) => k.category === category);
          return (
            <View key={category} style={styles.row}>
              <Text style={styles.category}>
                {iconForCategory(category)} {category}
              </Text>
              {words.length > 0 ? (
                <View style={styles.chips}>
                  {words.map((k) => (
                    <Pressable
                      key={k.keyword}
                      accessibilityRole="button"
                      accessibilityLabel={`Quitar ${k.keyword}`}
                      style={styles.chip}
                      onPress={() => handleRemove(k.keyword)}
                    >
                      <Text style={styles.chipText}>{k.keyword} ✕</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={styles.addRow}>
                <TextInput
                  style={styles.input}
                  placeholder="Agregar palabra"
                  placeholderTextColor={theme.textMuted}
                  value={drafts[category] ?? ''}
                  maxLength={MAX_KEYWORD_LENGTH}
                  autoCapitalize="none"
                  onChangeText={(value) => setDrafts((prev) => ({ ...prev, [category]: value }))}
                  onSubmitEditing={() => handleAdd(category)}
                  returnKeyType="done"
                />
                <Pressable style={styles.addButton} onPress={() => handleAdd(category)}>
                  <Text style={styles.addButtonText}>Agregar</Text>
                </Pressable>
              </View>
              {errors[category] ? <Text style={styles.error}>{errors[category]}</Text> : null}
            </View>
          );
        })}
      </FormScrollView>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.bg },
    intro: { fontSize: 13, color: theme.textSecondary, marginBottom: 16 },
    listContent: { padding: 16 },
    row: {
      marginBottom: 12,
      padding: 14,
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 14,
    },
    category: { fontSize: 16, fontWeight: '600', color: theme.text, marginBottom: 8 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    chip: {
      backgroundColor: theme.chipSelectedBg,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
      maxWidth: '100%',
    },
    chipText: { fontSize: 14, color: theme.chipSelectedText },
    addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    input: {
      flex: 1,
      minWidth: 160,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.bg,
      color: theme.text,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 10,
      fontSize: 14,
    },
    addButton: {
      backgroundColor: theme.primary,
      borderRadius: 8,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    addButtonText: { color: theme.primaryText, fontWeight: '600', fontSize: 14 },
    error: { fontSize: 12, color: theme.danger, marginTop: 4 },
  });
}
