/**
 * Admin Console Screen — User Management, Analytics, Pallis, and Traceability.
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/gate/ConfirmDialog';
import { DataTable, type Column } from '@/components/admin/DataTable';
import { MixingRecipeEditor } from '@/components/admin/MixingRecipeEditor';
import { PalliManager } from '@/components/admin/PalliManager';
import { ReportsList } from '@/components/admin/ReportsList';
import { StockSummaryTiles } from '@/components/admin/StockSummaryTiles';
import { GateButton } from '@/components/gate/GateButton';
import { GateInput } from '@/components/gate/GateInput';
import { StatusBadge } from '@/components/gate/StatusBadge';
import { Toast } from '@/components/gate/Toast';
import { GateColors, GateRadius, GateShadow } from '@/constants/gateTheme';
import {
  createUserApi,
  getAdminInventoryApi,
  getAdminReconciliationApi,
  getAdminTraceApi,
  getLookupsApi,
  getUsersApi,
  revokeUserTokensApi,
  updateUserApi,
} from '@/lib/api';
import type { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { formatRole } from '@/lib/format';
import type { AdminInventoryRowOut, ReconciliationRowOut, UserIn, UserOut, UserRole } from '@/lib/types';

const ROLES: { key: UserRole; label: string; desc: string; color: string }[] = [
  { key: 'GATEMAN', label: 'Gateman', desc: 'Gate entry, photos & weighment', color: GateColors.primary },
  { key: 'SUPERVISOR', label: 'Supervisor', desc: 'Shift logs & DOFF production', color: GateColors.unloading },
  { key: 'GODOWN_MANAGER_RM', label: 'RM Godown', desc: 'Raw material inventory & lots', color: GateColors.success },
  { key: 'GODOWN_MANAGER_PKG', label: 'PKG Godown', desc: 'Packaging records & dispatch', color: GateColors.loading },
  { key: 'GM_MD_ADMIN', label: 'GM / Admin', desc: 'Executive & system admin', color: GateColors.warning },
];

const fmtKg = (v: string | number) =>
  (typeof v === 'number' ? v : parseFloat(v) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

/** "2026-10-10" -> "10 Oct 2026" (parsed by hand so the timezone cannot shift the day). */
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, '0')} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]} ${y}`;
};

const gradeBadgeStyle = {
  fontSize: 12,
  fontWeight: '700' as const,
  color: GateColors.primary,
  backgroundColor: GateColors.primaryLight,
  paddingHorizontal: 8,
  paddingVertical: 2,
  borderRadius: 6,
  overflow: 'hidden' as const,
};

const inventoryColumns: Column<AdminInventoryRowOut>[] = [
  { key: 'loc', label: 'Location', flex: 2, strong: true, render: (r) => r.location_name },
  { key: 'var', label: 'Variety', flex: 2, render: (r) => r.variety_name },
  {
    key: 'grade',
    label: 'Grade',
    flex: 1,
    align: 'center',
    render: (r) => <Text style={gradeBadgeStyle}>{r.quality_grade}</Text>,
  },
  { key: 'bales', label: 'Bales', flex: 1, align: 'right', render: (r) => r.bale_count.toLocaleString('en-IN') },
  { key: 'kg', label: 'Total kg', flex: 1.6, align: 'right', accent: true, render: (r) => fmtKg(r.total_weight_kg) },
];

const reconciliationColumns: Column<ReconciliationRowOut>[] = [
  { key: 'date', label: 'Date', flex: 1.4, strong: true, render: (r) => fmtDate(r.as_of_date) },
  { key: 'rec', label: 'Received', flex: 1.3, align: 'right', render: (r) => fmtKg(r.raw_material_received_kg) },
  { key: 'blow', label: 'Blow room', flex: 1.3, align: 'right', render: (r) => fmtKg(r.issued_to_blow_room_kg) },
  { key: 'pack', label: 'Packed', flex: 1.3, align: 'right', render: (r) => fmtKg(r.finished_and_packed_kg) },
  { key: 'disp', label: 'Dispatched', flex: 1.5, align: 'right', accent: true, render: (r) => fmtKg(r.dispatched_kg) },
];

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'reports', label: 'Reports' },
  { key: 'users', label: 'Users' },
  { key: 'analytics', label: 'Stock & Analytics' },
  { key: 'pallis', label: 'Pallis' },
  { key: 'tools', label: 'Trace' },
  { key: 'recipe', label: 'Mixing recipe' },
] as const;

export default function AdminScreen() {
  const { fullName, role, signOut } = useAuth();
  const qc = useQueryClient();

  // Active top tab: 'users' | 'analytics' | 'tools'
  const [activeTab, setActiveTab] = useState<'overview' | 'reports' | 'users' | 'analytics' | 'pallis' | 'tools' | 'recipe'>('overview');

  // Toasts
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'error' | 'success' | 'info' }>({
    visible: false,
    message: '',
    type: 'info',
  });

  const showToast = (message: string, type: 'error' | 'success' | 'info' = 'info') => {
    setToast({ visible: true, message, type });
  };

  // Lookups data (gates, parties, bobbin colours)
  const { data: lookups } = useQuery({
    queryKey: ['lookups'],
    queryFn: getLookupsApi,
  });

  // ─── Staff list (server-side search / filter / paging) ───────────────────
  const USERS_PAGE_SIZE = 50;
  const [userSearch, setUserSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'ALL'>('ALL');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(userSearch), 350);
    return () => clearTimeout(t);
  }, [userSearch]);

  const {
    data: usersData,
    isLoading: usersLoading,
    isError: usersError,
    error: usersErrorObj,
    refetch: refetchUsers,
    isFetching: usersFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['admin-users', debouncedSearch, statusFilter, roleFilter],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      getUsersApi({
        search: debouncedSearch || undefined,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        role: roleFilter === 'ALL' ? undefined : roleFilter,
        limit: USERS_PAGE_SIZE,
        offset: pageParam,
      }),
    getNextPageParam: (lastPage, allPages) =>
      Array.isArray(lastPage) && lastPage.length === USERS_PAGE_SIZE
        ? allPages.length * USERS_PAGE_SIZE
        : undefined,
    enabled: activeTab === 'users',
  });
  const users: UserOut[] = (usersData?.pages ?? []).flatMap((pg) => (Array.isArray(pg) ? pg : []));
  const hasUserFilters = !!debouncedSearch || statusFilter !== 'ALL' || roleFilter !== 'ALL';

  // ─── Register User Modal & State ──────────────────────────────────────────
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [regFullName, setRegFullName] = useState('');
  const [regEmpCode, setRegEmpCode] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('GATEMAN');
  const [regSecret, setRegSecret] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regGateId, setRegGateId] = useState<string | null>(null);
  const [regErrors, setRegErrors] = useState<Partial<Record<'fullName' | 'empCode' | 'secret' | 'email' | 'phone', string>>>({});
  const [regFormError, setRegFormError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  // Destructive actions ask first
  const [pendingAction, setPendingAction] = useState<
    | { kind: 'deactivate'; user: UserOut }
    | { kind: 'revoke'; user: UserOut }
    | null
  >(null);

  const closeRegisterModal = () => {
    if (isRegistering) return;
    setShowRegisterModal(false);
    setRegErrors({});
    setRegFormError(null);
  };

  const validateRegisterForm = () => {
    const errors: typeof regErrors = {};
    if (!regFullName.trim()) errors.fullName = 'Full name is required.';
    if (!regEmpCode.trim()) errors.empCode = 'Employee code is required.';
    else if (!/^[A-Za-z0-9_-]+$/.test(regEmpCode.trim())) errors.empCode = 'Use letters, numbers, - or _ only.';
    if (!regSecret.trim()) errors.secret = 'PIN / password is required.';
    else if (regSecret.trim().length < 4) errors.secret = 'Must be at least 4 characters.';
    if (regEmail.trim() && !/^\S+@\S+\.\S+$/.test(regEmail.trim())) errors.email = 'Enter a valid email address.';
    if (regPhone.trim() && !/^[0-9+\-\s]{7,15}$/.test(regPhone.trim())) errors.phone = 'Enter a valid phone number.';
    setRegErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submitRegister = () => {
    setRegFormError(null);
    if (!validateRegisterForm()) {
      setRegFormError('Please fix the highlighted fields.');
      return;
    }
    registerUser();
  };

  const resetRegisterForm = () => {
    setRegFullName('');
    setRegEmpCode('');
    setRegRole('GATEMAN');
    setRegSecret('');
    setRegEmail('');
    setRegPhone('');
    setRegGateId(null);
  };

  const { mutate: registerUser, isPending: isRegistering } = useMutation({
    mutationFn: async () => {
      const payload: UserIn = {
        full_name: regFullName.trim(),
        employee_code: regEmpCode.trim().toUpperCase(),
        role: regRole,
        secret: regSecret.trim(),
        email: regEmail.trim() || null,
        phone: regPhone.trim() || null,
        gate_id: regRole === 'GATEMAN' && regGateId ? regGateId : null,
      };
      return createUserApi(payload);
    },
    onSuccess: (newUser) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      setShowRegisterModal(false);
      resetRegisterForm();
      setRegErrors({});
      setRegFormError(null);
      showToast(`${newUser.full_name} (${newUser.employee_code}) was registered.`, 'success');
    },
    onError: (err: ApiError) => {
      // Shown inside the form: a toast would be hidden behind the open modal.
      setRegFormError(err.message || 'Could not register this user. Please try again.');
    },
  });

  // ─── User Status Toggle & Token Revoke ────────────────────────────────────
  const { mutate: toggleUserStatus, isPending: isTogglingStatus } = useMutation({
    mutationFn: async ({ userId, newStatus }: { userId: string; newStatus: 'ACTIVE' | 'INACTIVE' }) => {
      return updateUserApi(userId, { status: newStatus });
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      showToast(`User status updated to ${updated.status}`, 'success');
    },
    onError: (err: ApiError) => {
      showToast(err.message || 'Failed to update user status.', 'error');
    },
  });

  const { mutate: revokeUserToken, isPending: isRevoking } = useMutation({
    mutationFn: async (userId: string) => {
      return revokeUserTokensApi(userId);
    },
    onSuccess: () => {
      showToast('All active tokens revoked for this user.', 'success');
    },
    onError: (err: ApiError) => {
      showToast(err.message || 'Failed to revoke tokens.', 'error');
    },
  });

  // ─── Analytics Queries ───────────────────────────────────────────────────
  const { data: inventory, isLoading: invLoading, refetch: refetchInv } = useQuery({
    queryKey: ['admin-inventory'],
    queryFn: getAdminInventoryApi,
    enabled: activeTab === 'analytics',
  });

  const { data: reconciliation, isLoading: recLoading, refetch: refetchRec } = useQuery({
    queryKey: ['admin-reconciliation'],
    queryFn: getAdminReconciliationApi,
    enabled: activeTab === 'analytics',
  });

  // ─── Traceability Search ─────────────────────────────────────────────────
  const [traceCode, setTraceCode] = useState('');
  const [traceResult, setTraceResult] = useState<any>(null);
  const [traceLoading, setTraceLoading] = useState(false);

  const handleTraceSearch = async () => {
    if (!traceCode.trim()) {
      showToast('Enter a code to trace (e.g. bale QR, DOFF ID)', 'error');
      return;
    }
    setTraceLoading(true);
    setTraceResult(null);
    try {
      const res = await getAdminTraceApi(traceCode.trim());
      setTraceResult(res);
      showToast('Trace record retrieved successfully.', 'success');
    } catch (e) {
      const err = e as ApiError;
      showToast(err.message || 'Trace search failed.', 'error');
    } finally {
      setTraceLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeIcon}>M</Text>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.brandTitle} numberOfLines={1}>MillTrack Admin</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {fullName ?? 'Administrator'} · {formatRole(role ?? 'GM_MD_ADMIN')}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={async () => {
            await signOut();
            router.replace('/login');
          }}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Top Tabs (horizontally scrollable) ──────────────────────────── */}
      <View style={styles.tabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tabBtn, activeTab === t.key && styles.tabBtnActive]}
              onPress={() => setActiveTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === t.key }}
            >
              <Text
                numberOfLines={1}
                style={[styles.tabBtnText, activeTab === t.key && styles.tabBtnTextActive]}
              >
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={styles.tabsDivider} />
          <TouchableOpacity style={styles.tabBtn} onPress={() => router.push('/(gate)/vehicles')}>
            <Text numberOfLines={1} style={styles.tabBtnText}>Gate terminal ↗</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabBtn} onPress={() => router.push('/(godown)' as any)}>
            <Text numberOfLines={1} style={styles.tabBtnText}>Godown ↗</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ─── Main Content ────────────────────────────────────────────────── */}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.contentInner}>
        {/* ─── OVERVIEW: governing numbers ─────────────────────────────── */}
        {activeTab === 'overview' && (
          <View style={styles.section}>
            <StockSummaryTiles />
          </View>
        )}

        {/* ─── TAB 1: USER MANAGEMENT ───────────────────────────────────── */}
        {activeTab === 'users' && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>User Provisioning</Text>
                <Text style={styles.sectionSub}>
                  Create accounts for Gatemen, Supervisors, Godown Managers, and Admins.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.primaryAddBtn}
                onPress={() => setShowRegisterModal(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryAddBtnText}>+ Register user</Text>
              </TouchableOpacity>
            </View>

            {/* Staff list */}
            <Text style={styles.subHeading}>
              Staff accounts{users.length > 0 ? ` (${users.length}${hasNextPage ? '+' : ''})` : ''}
            </Text>

            <TextInput
              style={styles.userSearchInput}
              value={userSearch}
              onChangeText={setUserSearch}
              placeholder="Search by name or employee code"
              placeholderTextColor={GateColors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.pillScroll}
              contentContainerStyle={styles.filterChipsRow}
            >
              {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[styles.choicePill, statusFilter === st && styles.choicePillActive]}
                  onPress={() => setStatusFilter(st)}
                >
                  <Text style={[styles.choicePillText, statusFilter === st && styles.choicePillTextActive]}>
                    {st === 'ALL' ? 'All status' : st === 'ACTIVE' ? 'Active' : 'Inactive'}
                  </Text>
                </TouchableOpacity>
              ))}
              <View style={styles.tabsDivider} />
              {(['ALL', ...ROLES.map((r) => r.key)] as const).map((rk) => (
                <TouchableOpacity
                  key={rk}
                  style={[styles.choicePill, roleFilter === rk && styles.choicePillActive]}
                  onPress={() => setRoleFilter(rk as UserRole | 'ALL')}
                >
                  <Text style={[styles.choicePillText, roleFilter === rk && styles.choicePillTextActive]}>
                    {rk === 'ALL' ? 'All roles' : ROLES.find((r) => r.key === rk)?.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {usersLoading ? (
              <ActivityIndicator size="small" color={GateColors.primary} style={{ marginVertical: 24 }} />
            ) : usersError ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Could not load users</Text>
                <Text style={styles.emptySub}>{(usersErrorObj as Error)?.message ?? 'Something went wrong.'}</Text>
                <TouchableOpacity style={[styles.refreshBtn, { marginTop: 12 }]} onPress={() => refetchUsers()}>
                  <Text style={styles.refreshBtnText}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : users.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>{hasUserFilters ? 'No users match' : 'No users yet'}</Text>
                <Text style={styles.emptySub}>
                  {hasUserFilters
                    ? 'Try a different search or clear the filters.'
                    : 'Tap "Register user" to add the first account.'}
                </Text>
              </View>
            ) : (
              users.map((user) => {
                const roleMeta = ROLES.find((r) => r.key === user.role);
                const isActive = user.status === 'ACTIVE';
                const roleColor = roleMeta?.color ?? GateColors.primary;

                return (
                  <View key={user.id} style={styles.userCard}>
                    <View style={styles.userCardTop}>
                      <View style={styles.userAvatar}>
                        <Text style={styles.userAvatarText}>{user.full_name[0]?.toUpperCase() ?? 'U'}</Text>
                      </View>
                      <View style={styles.userCardInfo}>
                        <Text style={styles.userCardName} numberOfLines={1}>{user.full_name}</Text>
                        <Text style={styles.userCardCode} numberOfLines={1}>
                          {user.employee_code} · <Text style={{ color: roleColor, fontWeight: '600' }}>{roleMeta?.label ?? user.role}</Text>
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.userStatusPill,
                          { backgroundColor: isActive ? GateColors.successLight : GateColors.dangerLight },
                        ]}
                      >
                        <Text
                          style={[
                            styles.userStatusPillText,
                            { color: isActive ? GateColors.success : GateColors.danger },
                          ]}
                        >
                          {isActive ? 'Active' : 'Inactive'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.userCardActions}>
                      <TouchableOpacity
                        style={[styles.userActionBtn, isTogglingStatus && styles.btnBusy]}
                        disabled={isTogglingStatus}
                        onPress={() =>
                          isActive
                            ? setPendingAction({ kind: 'deactivate', user })
                            : toggleUserStatus({ userId: user.id, newStatus: 'ACTIVE' })
                        }
                      >
                        <Text style={styles.userActionBtnText}>{isActive ? 'Deactivate' : 'Activate'}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.userActionBtn, styles.revokeBtn, isRevoking && styles.btnBusy]}
                        disabled={isRevoking}
                        onPress={() => setPendingAction({ kind: 'revoke', user })}
                      >
                        <Text style={[styles.userActionBtnText, styles.revokeBtnText]}>Revoke sessions</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}

            {hasNextPage ? (
              <TouchableOpacity
                style={styles.loadMoreBtn}
                onPress={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <ActivityIndicator size="small" color={GateColors.primary} />
                ) : (
                  <Text style={styles.refreshBtnText}>Load more</Text>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* ─── TAB 2: STOCK & ANALYTICS ─────────────────────────────────── */}
        {activeTab === 'analytics' && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderText}>
                <Text style={styles.sectionTitle}>Raw Material Live Stock</Text>
                <Text style={styles.sectionSub}>Live stock by location, variety, and quality grade.</Text>
              </View>
              <TouchableOpacity
                style={styles.refreshBtn}
                onPress={() => {
                  refetchInv();
                  refetchRec();
                }}
              >
                <Text style={styles.refreshBtnText}>↻ Refresh</Text>
              </TouchableOpacity>
            </View>

            {invLoading ? (
              <ActivityIndicator size="small" color={GateColors.primary} style={{ marginVertical: 24 }} />
            ) : !Array.isArray(inventory) || inventory.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No stock records found</Text>
                <Text style={styles.emptySub}>
                  Weighed bales stored in godowns will appear here automatically.
                </Text>
              </View>
            ) : (
              <DataTable
                columns={inventoryColumns}
                rows={inventory}
                getKey={(r, i) => `${r.godown_location_id}-${r.material_variety_id}-${r.quality_grade}-${i}`}
              />
            )}

            {/* Daily Reconciliation */}
            <Text style={[styles.subHeading, { marginTop: 28, marginBottom: 2 }]}>Daily Mill Reconciliation</Text>
            <Text style={styles.tableCaption}>All weights in kg</Text>
            {recLoading ? (
              <ActivityIndicator size="small" color={GateColors.primary} style={{ marginVertical: 24 }} />
            ) : !Array.isArray(reconciliation) || reconciliation.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No reconciliation records</Text>
              </View>
            ) : (
              <DataTable
                columns={reconciliationColumns}
                rows={reconciliation.slice(0, 7)}
                getKey={(r, i) => `${r.as_of_date}-${i}`}
              />
            )}
          </View>
        )}

        {/* ─── REPORTS: permanent PDF sheets ───────────────────────────── */}
        {activeTab === 'reports' && (
          <View style={styles.section}>
            <ReportsList onToast={showToast} />
          </View>
        )}

        {/* ─── PALLIS: create + the full list ──────────────────────────── */}
        {activeTab === 'pallis' && (
          <View style={styles.section}>
            <PalliManager onToast={showToast} />
          </View>
        )}

        {/* ─── TAB 4: STANDARD MIXING RECIPE ────────────────────────────── */}
        {activeTab === 'recipe' && (
          <View style={styles.section}>
            <MixingRecipeEditor onToast={showToast} />
          </View>
        )}

        {/* ─── TAB 3: TRACEABILITY & PALLIS ─────────────────────────────── */}
        {activeTab === 'tools' && (
          <View style={styles.section}>
            {/* Traceability */}
            <Text style={styles.sectionTitle}>Cross-Entity Traceability</Text>
            <Text style={styles.sectionSub}>
              Search forward and backward chain of custody by Bale QR, Lot, DOFF, or Dispatch code.
            </Text>

            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                value={traceCode}
                onChangeText={setTraceCode}
                placeholder="Enter QR / Code (e.g. BALE-..., LOT-...)"
                placeholderTextColor={GateColors.textMuted}
                autoCapitalize="characters"
              />
              <TouchableOpacity
                style={styles.searchBtn}
                onPress={handleTraceSearch}
                disabled={traceLoading}
              >
                {traceLoading ? (
                  <ActivityIndicator size="small" color={GateColors.onPrimary} />
                ) : (
                  <Text style={styles.searchBtnText}>Trace</Text>
                )}
              </TouchableOpacity>
            </View>

            {traceResult ? (
              <View style={styles.resultCard}>
                <Text style={styles.resultTitle}>Chain of Custody Record</Text>
                <Text style={styles.resultJson}>{JSON.stringify(traceResult, null, 2)}</Text>
              </View>
            ) : null}
          </View>
        )}
        </View>
      </ScrollView>

      {/* ─── REGISTER USER MODAL ─────────────────────────────────────────── */}
      <Modal visible={showRegisterModal} animationType="fade" transparent onRequestClose={closeRegisterModal}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeRegisterModal} accessibilityLabel="Close" />
          <View style={[styles.modalContent, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register new user</Text>
              <TouchableOpacity onPress={closeRegisterModal} hitSlop={12} accessibilityLabel="Close">
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScrollView}
              contentContainerStyle={styles.modalScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              <GateInput
                label="Full name"
                value={regFullName}
                onChangeText={(t) => {
                  setRegFullName(t);
                  setRegErrors((e) => ({ ...e, fullName: undefined }));
                }}
                error={regErrors.fullName}
                placeholder="e.g. Ramesh Kumar"
              />

              <GateInput
                label="Employee code"
                value={regEmpCode}
                onChangeText={(t) => {
                  setRegEmpCode(t.toUpperCase());
                  setRegErrors((e) => ({ ...e, empCode: undefined }));
                }}
                error={regErrors.empCode}
                placeholder="e.g. GATE001 or SUP001"
                autoCapitalize="characters"
                autoCorrect={false}
              />

              {/* Role Selector */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Role</Text>
                <View style={styles.roleChoiceContainer}>
                  {ROLES.map((r) => (
                    <TouchableOpacity
                      key={r.key}
                      style={[styles.roleChoiceItem, regRole === r.key && styles.roleChoiceItemActive]}
                      onPress={() => setRegRole(r.key)}
                    >
                      <View style={[styles.roleDot, { backgroundColor: r.color }]} />
                      <Text style={[styles.roleChoiceText, regRole === r.key && styles.roleChoiceTextActive]}>
                        {r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <GateInput
                label="PIN / password"
                value={regSecret}
                onChangeText={(t) => {
                  setRegSecret(t);
                  setRegErrors((e) => ({ ...e, secret: undefined }));
                }}
                error={regErrors.secret}
                placeholder="At least 4 characters"
                secureTextEntry
              />

              <GateInput
                label="Email"
                optional
                value={regEmail}
                onChangeText={(t) => {
                  setRegEmail(t);
                  setRegErrors((e) => ({ ...e, email: undefined }));
                }}
                error={regErrors.email}
                placeholder="staff@milltrack.com"
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <GateInput
                label="Phone"
                optional
                value={regPhone}
                onChangeText={(t) => {
                  setRegPhone(t);
                  setRegErrors((e) => ({ ...e, phone: undefined }));
                }}
                error={regErrors.phone}
                placeholder="9876543210"
                keyboardType="phone-pad"
              />

              {/* If Gateman, pick gate */}
              {regRole === 'GATEMAN' && lookups?.gates && lookups.gates.length > 0 && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>
                    Assigned gate <Text style={styles.fieldOptional}>optional</Text>
                  </Text>
                  <View style={styles.gateChoiceRow}>
                    {lookups.gates.map((g) => (
                      <TouchableOpacity
                        key={g.id}
                        style={[styles.gatePill, regGateId === g.id && styles.gatePillActive]}
                        onPress={() => setRegGateId(regGateId === g.id ? null : g.id)}
                      >
                        <Text style={[styles.gatePillText, regGateId === g.id && styles.gatePillTextActive]}>
                          {g.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

            </ScrollView>

            {regFormError ? (
              <View style={styles.formErrorBox} accessibilityRole="alert">
                <Text style={styles.formErrorText}>{regFormError}</Text>
              </View>
            ) : null}

            <View style={styles.modalFooter}>
              <GateButton
                label="Cancel"
                variant="ghost"
                onPress={closeRegisterModal}
                disabled={isRegistering}
                style={styles.footerBtn}
              />
              <GateButton
                label="Create account"
                loading={isRegistering}
                onPress={submitRegister}
                disabled={isRegistering}
                style={styles.footerBtn}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmDialog
        visible={!!pendingAction}
        title={pendingAction?.kind === 'revoke' ? 'Revoke all sessions?' : 'Deactivate user?'}
        message={
          pendingAction?.kind === 'revoke'
            ? `${pendingAction.user.full_name} will be signed out on every device and must log in again.`
            : pendingAction
              ? `${pendingAction.user.full_name} will no longer be able to sign in until reactivated.`
              : ''
        }
        confirmLabel={pendingAction?.kind === 'revoke' ? 'Revoke' : 'Deactivate'}
        confirmVariant="danger"
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (!pendingAction) return;
          const { kind, user } = pendingAction;
          setPendingAction(null);
          if (kind === 'revoke') revokeUserToken(user.id);
          else toggleUserStatus({ userId: user.id, newStatus: 'INACTIVE' });
        }}
      />

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: GateColors.surface0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface3,
    backgroundColor: GateColors.surface1,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerText: { flex: 1, minWidth: 0 },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: GateColors.primaryLight,
    borderWidth: 1,
    borderColor: GateColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoBadgeIcon: {
    fontSize: 18,
    fontWeight: '800',
    color: GateColors.primary,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: GateColors.textPrimary,
  },
  userName: {
    fontSize: 12,
    color: GateColors.textSecondary,
    marginTop: 1,
  },
  signOutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: GateRadius.md,
    borderWidth: 1,
    borderColor: GateColors.surface4,
  },
  signOutText: {
    fontSize: 13,
    color: GateColors.textSecondary,
    fontWeight: '600',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 8,
  },
  tabsDivider: {
    width: 1,
    backgroundColor: GateColors.surface3,
    marginVertical: 10,
    marginHorizontal: 6,
  },
  tabBtn: {
    flexShrink: 0,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: GateColors.primary,
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: GateColors.textSecondary,
  },
  tabBtnTextActive: {
    color: GateColors.primary,
  },
  content: {
    paddingVertical: 20,
    paddingHorizontal: 16,
    paddingBottom: 96,
  },
  contentInner: {
    width: '100%',
    maxWidth: 880,
    alignSelf: 'center',
  },
  section: {},
  sectionHeaderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  sectionHeaderText: { flexGrow: 1, flexShrink: 1, flexBasis: 220, minWidth: 0 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: GateColors.textPrimary,
  },
  sectionSub: {
    fontSize: 13,
    lineHeight: 18,
    color: GateColors.textSecondary,
    marginTop: 4,
  },
  primaryAddBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GateColors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: GateRadius.md,
  },
  primaryAddBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: GateColors.onPrimary,
  },
  roleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  subHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: GateColors.textPrimary,
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    borderStyle: 'dashed',
    borderRadius: GateRadius.lg,
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 4,
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: GateColors.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    lineHeight: 18,
    color: GateColors.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
  userCard: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    borderRadius: GateRadius.md,
    padding: 14,
    marginBottom: 10,
    gap: 12,
    ...GateShadow.card,
  },
  userCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  userCardInfo: { flex: 1, minWidth: 0 },
  userAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: GateColors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: GateColors.primary,
  },
  userCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: GateColors.textPrimary,
  },
  userStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: GateRadius.full,
  },
  userStatusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  userCardCode: {
    fontSize: 13,
    color: GateColors.textSecondary,
    marginTop: 2,
  },
  userCardActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: GateColors.surface3,
  },
  userActionBtn: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: GateRadius.md,
  },
  btnBusy: { opacity: 0.5 },
  userActionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: GateColors.textPrimary,
  },
  revokeBtn: {
    borderColor: GateColors.dangerLight,
    backgroundColor: GateColors.dangerLight,
  },
  revokeBtnText: {
    color: GateColors.danger,
  },
  refreshBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
  },
  refreshBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: GateColors.textSecondary,
  },
  tableCard: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    borderRadius: GateRadius.md,
  },
  tableInner: { minWidth: 560, flexGrow: 1 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: GateColors.surface2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface4,
  },
  th: {
    fontSize: 11,
    fontWeight: '700',
    color: GateColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    paddingRight: 8,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface3,
  },
  td: {
    fontSize: 13,
    color: GateColors.textPrimary,
    paddingRight: 8,
  },
  gradeBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: GateColors.primary,
    backgroundColor: GateColors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 12,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
    paddingHorizontal: 12,
    color: GateColors.textPrimary,
    fontSize: 15,
  },
  searchBtn: {
    minWidth: 84,
    backgroundColor: GateColors.primary,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: GateRadius.md,
  },
  searchBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: GateColors.onPrimary,
  },
  resultCard: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
    padding: 12,
    marginTop: 8,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: GateColors.primary,
    marginBottom: 6,
  },
  resultJson: {
    fontSize: 12,
    lineHeight: 17,
    color: GateColors.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  formCard: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    borderRadius: GateRadius.md,
    padding: 16,
    marginTop: 8,
    gap: 12,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: GateColors.textSecondary,
    marginBottom: 6,
  },
  pillScroll: {
    flexGrow: 0,
    marginBottom: 4,
  },
  choicePill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: GateColors.surface2,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.full,
    marginRight: 8,
  },
  choicePillActive: {
    borderColor: GateColors.primary,
    backgroundColor: GateColors.primaryLight,
  },
  choicePillText: {
    fontSize: 13,
    color: GateColors.textSecondary,
  },
  choicePillTextActive: {
    color: GateColors.primary,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: GateColors.overlay,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '92%',
    backgroundColor: GateColors.surface1,
    borderTopLeftRadius: GateRadius.xl,
    borderTopRightRadius: GateRadius.xl,
    paddingTop: 16,
    paddingHorizontal: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface3,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: GateColors.textPrimary,
  },
  modalCloseText: {
    fontSize: 18,
    color: GateColors.textSecondary,
    paddingHorizontal: 6,
  },
  modalScrollView: { flexShrink: 1, flexGrow: 0 },
  modalScroll: {
    paddingTop: 16,
    paddingBottom: 12,
    gap: 16,
  },
  fieldGroup: { gap: 8 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: GateColors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  fieldOptional: {
    fontSize: 11,
    fontWeight: '500',
    fontStyle: 'italic',
    textTransform: 'none',
    color: GateColors.textMuted,
  },
  formErrorBox: {
    marginTop: 8,
    backgroundColor: GateColors.dangerLight,
    borderWidth: 1,
    borderColor: GateColors.danger,
    borderRadius: GateRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  formErrorText: {
    color: GateColors.danger,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: GateColors.surface3,
  },
  footerBtn: { flex: 1 },
  roleChoiceContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleChoiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: GateColors.surface2,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
  },
  roleChoiceItemActive: {
    borderColor: GateColors.primary,
    backgroundColor: GateColors.primaryLight,
  },
  roleChoiceText: {
    fontSize: 13,
    color: GateColors.textSecondary,
  },
  roleChoiceTextActive: {
    color: GateColors.primary,
    fontWeight: '700',
  },
  gateChoiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  gatePill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: GateColors.surface2,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
  },
  gatePillActive: {
    borderColor: GateColors.primary,
    backgroundColor: GateColors.primaryLight,
  },
  gatePillText: {
    fontSize: 13,
    color: GateColors.textSecondary,
  },
  gatePillTextActive: {
    color: GateColors.primary,
    fontWeight: '600',
  },
  tabsWrap: {
    backgroundColor: GateColors.surface1,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface3,
  },
  emptyHint: {
    fontSize: 13,
    color: GateColors.textMuted,
    fontStyle: 'italic',
  },
  userSearchInput: {
    minHeight: 46,
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
    paddingHorizontal: 12,
    color: GateColors.textPrimary,
    fontSize: 15,
    marginBottom: 10,
  },
  filterChipsRow: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  loadMoreBtn: {
    alignSelf: 'center',
    minWidth: 140,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginTop: 4,
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
  },
  tableCaption: { fontSize: 12, color: GateColors.textMuted, marginBottom: 8 },
});
