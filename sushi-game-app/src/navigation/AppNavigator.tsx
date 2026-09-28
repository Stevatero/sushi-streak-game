import React from 'react';
import { NavigationContainer, DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import GameSessionScreen from '../screens/GameSessionScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SessionHistoryScreen from '../screens/SessionHistoryScreen';
import { useColorScheme } from '../theme/ThemeProvider';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator = () => {
  const { isDarkMode, theme } = useColorScheme();
  const baseTheme = isDarkMode ? DarkTheme : DefaultTheme;

  return (
    <NavigationContainer
      theme={{
        ...baseTheme,
        colors: {
          ...baseTheme.colors,
          background: theme.colors.background,
          primary: theme.colors.primary,
          card: theme.colors.surface,
          text: theme.colors.onSurface,
          border: theme.colors.outlineVariant,
          notification: theme.colors.primary,
        },
      }}
    >
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          animation: 'fade',
          gestureEnabled: true,
          headerShown: false,
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen
          name="GameSession"
          component={GameSessionScreen}
          // Niente swipe-back: l'uscita dalla partita passa sempre da una conferma
          options={{ animation: 'slide_from_right', gestureEnabled: false }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="SessionHistory"
          component={SessionHistoryScreen}
          options={{ animation: 'slide_from_right' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
