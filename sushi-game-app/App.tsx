import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import React, { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
} from '@expo-google-fonts/outfit';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import ErrorBoundary from './src/components/ErrorBoundary';
import { ThemeProvider, useColorScheme } from './src/theme/ThemeProvider';
import { preferences } from './src/services/preferences';
import { logger } from './src/utils/logger';

// Lo splash nativo resta visibile finché font e preferenze non sono pronti
SplashScreen.preventAutoHideAsync().catch(() => {
  // già nascosto (es. fast refresh): nessuna azione necessaria
});

// I deep link (sushi-streak://join/CODICE e https://.../join/CODICE) sono gestiti solo dalla HomeScreen
const ThemedApp = () => {
  const { theme, isDarkMode, isReady } = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
  });
  // Se il font non si carica si prosegue con quello di sistema
  const appReady = isReady && (fontsLoaded || !!fontError);

  useEffect(() => {
    preferences.clearLegacyKeys();
  }, []);

  useEffect(() => {
    if (fontError) logger.warn('Caricamento font non riuscito, uso il font di sistema', fontError);
  }, [fontError]);

  const onLayout = useCallback(() => {
    if (appReady) SplashScreen.hideAsync().catch(() => undefined);
  }, [appReady]);

  if (!appReady) return null;

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      <PaperProvider theme={theme}>
        <StatusBar style={isDarkMode ? 'light' : 'dark'} />
        <AppNavigator />
      </PaperProvider>
    </View>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <ThemedApp />
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
