import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { initDatabase } from './src/db/database';
import { ThemeProvider, useThemeControls } from './src/theme';
import { UpdateNotice } from './src/components/UpdateNotice';

function ThemedStatusBar() {
  const { resolved } = useThemeControls();
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
            </SQLiteProvider>
          </KeyboardProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  );
}
