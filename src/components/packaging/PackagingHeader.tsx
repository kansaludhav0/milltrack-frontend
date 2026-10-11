import { router, usePathname } from 'expo-router';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { GateColors, GateRadius } from '@/constants/gateTheme';
import { useAuth } from '@/lib/AuthContext';

const TABS = [
  { label: 'Pack bag', route: '/(packaging)', match: (p: string) => !/dispatch|loose-stock|paper-log/.test(p) },
  { label: 'Dispatch', route: '/(packaging)/dispatch', match: (p: string) => p.includes('dispatch') },
  { label: 'Loose stock', route: '/(packaging)/loose-stock', match: (p: string) => p.includes('loose-stock') },
  { label: 'Paper log', route: '/(packaging)/paper-log', match: (p: string) => p.includes('paper-log') },
] as const;

/** Title, user and the packaging screens: pack a bag, dispatch, loose stock and the paper log. */
export function PackagingHeader() {
  const { fullName, signOut } = useAuth();
  const pathname = usePathname();

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <View style={styles.topText}>
          <Text style={styles.title}>Packaging</Text>
          <Text style={styles.user} numberOfLines={1}>{fullName ?? 'Packaging manager'}</Text>
        </View>
        <TouchableOpacity
          style={styles.signOut}
          onPress={async () => {
            await signOut();
            router.replace('/login');
          }}
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {TABS.map((t) => {
          const active = t.match(pathname);
          return (
            <TouchableOpacity
              key={t.route}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => router.navigate(t.route as never)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export { DateStepper } from '@/components/DateStepper';

const styles = StyleSheet.create({
  wrap: { backgroundColor: GateColors.surface1, borderBottomWidth: 1, borderBottomColor: GateColors.surface3 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  topText: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: '700', color: GateColors.textPrimary },
  user: { fontSize: 12, color: GateColors.textSecondary, marginTop: 1 },
  signOut: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: GateRadius.md, borderWidth: 1, borderColor: GateColors.surface4 },
  signOutText: { fontSize: 13, fontWeight: '600', color: GateColors.textSecondary },
  tabs: { paddingHorizontal: 8 },
  tab: { alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: GateColors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: GateColors.textSecondary },
  tabTextActive: { color: GateColors.primary, fontWeight: '700' },
});
