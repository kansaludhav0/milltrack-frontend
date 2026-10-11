/**
 * Root index — checks auth + gate pairing, redirects accordingly.
 */
import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { GateColors } from '@/constants/gateTheme';
import { useAuth } from '@/lib/AuthContext';

export default function IndexScreen() {
  const { token, role, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={GateColors.primary} />
      </View>
    );
  }

  if (!token) {
    return <Redirect href="/login" />;
  }

  // Admin users go to Admin dashboard; Godown to Godown queue; others to Gate vehicles
  if (role === 'GM_MD_ADMIN' || (role && role.includes('ADMIN'))) {
    return <Redirect href={"/(admin)" as any} />;
  }

  if (role === 'GODOWN_MANAGER_PKG') {
    return <Redirect href={"/(packaging)" as any} />;
  }

  if (role === 'SUPERVISOR') {
    return <Redirect href={"/(supervisor)" as any} />;
  }

  if (role && role.includes('GODOWN')) {
    return <Redirect href={"/(godown)" as any} />;
  }

  return <Redirect href="/(gate)/vehicles" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GateColors.surface0,
  },
});
