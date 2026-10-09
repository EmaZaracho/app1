import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { SQLiteProvider } from 'expo-sqlite';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { initDatabase } from './src/db/database';
import { ThemeProvider, useTheme, useThemeControls } from './src/theme';
import { UpdateNotice } from './src/components/UpdateNotice';
import { ReminderSync } from './src/components/ReminderSync';

/**
 * Sincroniza las barras del sistema con el tema de la app, que puede diferir del
 * del sistema (botón de modo oscuro propio). Las barras son transparentes en
 * Android: lo que se ve detrás es el fondo raíz, que por defecto sigue al tema
 * del sistema. Se lo pinta del color de la app para que no asome un borde blanco.
 */
function ThemedStatusBar() {
  const { resolved } = useThemeControls();
  const theme = useTheme();
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.bg).catch(() => {});
  }, [theme.bg]);
  return <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <KeyboardProvider>
            <SQLiteProvider databaseName="expenses.db" onInit={initDatabase}>
              <AppNavigator />
              <ThemedStatusBar />
              <UpdateNotice />
              <ReminderSync />
            </SQLiteProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
