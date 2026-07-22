import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, type Theme } from '../theme';

interface UndoBannerProps {
  visible: boolean;
  onUndo: () => void;
}

export function UndoBanner({ visible, onUndo }: UndoBannerProps) {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  if (!visible) return null;

  return (
    <View style={styles.undoBanner}>
      <Text style={styles.undoText}>Movimiento eliminado.</Text>
      <Pressable onPress={onUndo}>
        <Text style={styles.undoButtonText}>Deshacer</Text>
      </Pressable>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    undoBanner: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: theme.undoBg,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginHorizontal: 16,
      marginBottom: 8,
      borderRadius: 10,
    },
    undoText: { color: theme.undoText, fontSize: 14 },
    undoButtonText: { color: theme.undoAction, fontWeight: '700', fontSize: 14 },
  });
}
