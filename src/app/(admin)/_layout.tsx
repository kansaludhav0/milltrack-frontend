import { router, Slot } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { GateColors } from '@/constants/gateTheme';
import { useAuth } from '@/lib/AuthContext';

export default function AdminLayout() {
  const { token, role, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !token) {
      router.replace('/login');
    }
  }, [isLoading, token]);

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GateColors.primary} />
      </View>
    );
  }

  if (!token) {
    return null;
  }

  return <Slot />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GateColors.surface0,
  },
});
