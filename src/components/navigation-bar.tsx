import React from 'react';
import { ScrollView, View, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/lib/AuthContext';
import { formatRole } from '@/lib/format';
import { GateColors } from '@/constants/gateTheme';

const TABS = [
  { label: 'Unloading', route: '/(godown)' },
  { label: 'Godown Stock', route: '/(godown)/inventory' },
  { label: 'Mixing', route: '/(godown)/wip' },
] as const;

export function NavigationBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { fullName, role, signOut } = useAuth();

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.userBadge}>
          <ThemedText style={styles.userDot}>●</ThemedText>
          <ThemedText style={styles.userName} numberOfLines={1}>
            {fullName ?? 'Godown Manager'}
          </ThemedText>
          {role && (
            <View style={styles.roleTag}>
              <ThemedText style={styles.roleTagText}>{formatRole(role)}</ThemedText>
            </View>
          )}
        </View>

        <View style={styles.actionRow}>
          {role === 'GM_MD_ADMIN' && (
            <TouchableOpacity
              style={styles.adminBtn}
              onPress={() => router.push('/(admin)' as any)}
              activeOpacity={0.7}
            >
              <ThemedText style={styles.adminBtnText}>Admin →</ThemedText>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.signOutBtn}
            onPress={async () => {
              await signOut();
              router.replace('/login');
            }}
            activeOpacity={0.7}
          >
            <ThemedText style={styles.signOutText}>Sign Out</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
        style={styles.pillScroll}
      >
        {TABS.map((tab) => {
          let isActive = false;
          if (tab.route === '/(godown)') {
            isActive =
              pathname === '/(godown)' ||
              pathname === '/(godown)/' ||
              pathname === '/(godown)/index' ||
              pathname === '/' ||
              pathname.includes('/unload');
          } else {
            const sub = tab.route.replace('/(godown)/', '');
            isActive = pathname.includes(sub);
          }

          return (
            <TouchableOpacity
              key={tab.route}
              style={[styles.pill, isActive && styles.pillActive]}
              onPress={() => router.navigate(tab.route as any)}
              activeOpacity={0.8}
            >
              <ThemedText
                style={[styles.pillText, isActive ? styles.pillTextActive : styles.pillTextInactive]}
              >
                {tab.label}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface3,
    backgroundColor: GateColors.surface1,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  userDot: {
    color: GateColors.success,
    fontSize: 10,
  },
  userName: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: GateColors.textPrimary,
  },
  roleTag: {
    backgroundColor: GateColors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  roleTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: GateColors.primary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adminBtn: {
    backgroundColor: GateColors.surface2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  adminBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: GateColors.primary,
  },
  signOutBtn: {
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  signOutText: {
    fontSize: 13,
    fontWeight: '600',
    color: GateColors.textMuted,
  },
  pillScroll: { flexGrow: 0 },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
    paddingBottom: 4,
  },
  pill: {
    flexShrink: 0,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GateColors.surface2,
  },
  pillActive: {
    backgroundColor: GateColors.primary,
    shadowColor: GateColors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  pillTextActive: {
    color: GateColors.onPrimary,
  },
  pillTextInactive: {
    color: GateColors.textSecondary,
  },
});
