import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useThemeControls } from '../theme';

/** Botón para alternar entre modo claro y oscuro (se ubica en el header). */
export function ThemeToggleButton() {
  const { resolved, toggle } = useThemeControls();
  return (
    <Pressable onPress={toggle} hitSlop={12} style={styles.button}>
      <Text style={styles.icon}>{resolved === 'dark' ? '☀️' : '🌙'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingHorizontal: 4, paddingVertical: 4 },
  icon: { fontSize: 20 },
});
