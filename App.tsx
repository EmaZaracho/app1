import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { initDatabase } from './src/db/database';

export default function App() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="expenses.db" onInit={initDatabase}>
        <AppNavigator />
        <StatusBar style="auto" />
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
