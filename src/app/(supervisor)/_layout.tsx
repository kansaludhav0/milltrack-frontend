import { router, Stack } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { GateColors } from '@/constants/gateTheme';
import { useAuth } from '@/lib/AuthContext';

export default function SupervisorLayout() {
  const { token, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !token) router.replace('/login');
  }, [isLoading, token]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GateColors.primary} />
      </View>
    );
  }
  if (!token) return null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: GateColors.surface0 },
        animation: 'fade',
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: GateColors.surface0 },
});
