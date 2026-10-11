import { focusManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { GateColors } from '@/constants/gateTheme';
import { AuthProvider } from '@/lib/AuthContext';
import { OfflineQueueProvider } from '@/lib/OfflineQueueContext';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 30, // 30 seconds
      gcTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // On phones, tell React Query when the app comes back to the foreground so stale data
  // (e.g. the current shift after the 7 am / 7 pm boundary) refreshes straight away.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (state) => focusManager.setFocused(state === 'active'));
    return () => sub.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <OfflineQueueProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: GateColors.surface0 },
              animation: 'fade',
            }}
          />
        </OfflineQueueProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
