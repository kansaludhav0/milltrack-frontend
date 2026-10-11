import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { DataTable, type Column } from '@/components/admin/DataTable';
import { GateButton } from '@/components/gate/GateButton';
import { GateInput } from '@/components/gate/GateInput';
import { SelectField } from '@/components/gate/SelectField';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import { createPalliApi, getLookupsApi } from '@/lib/api';
import type { Palli } from '@/lib/types';

interface Props {
  onToast: (message: string, type: 'success' | 'error') => void;
}

/**
 * Pallis (a client + bobbin colour combination packaging packs bags against):
 * add a new one and see every Palli that exists. The list is the same active
 * list every picker in the app uses.
 */
export function PalliManager({ onToast }: Props) {
  const qc = useQueryClient();
  const { data: lookups, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['lookups'],
    queryFn: getLookupsApi,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const parties = lookups?.parties ?? [];
  const colours = lookups?.bobbin_colours ?? [];
  const pallis = lookups?.pallis ?? [];
  const partyName = (id: string) => parties.find((p) => p.id === id)?.name ?? '';
  const colourName = (id: string) => colours.find((c) => c.id === id)?.name ?? '';

  const [partyId, setPartyId] = useState<string | null>(null);
  const [colourId, setColourId] = useState<string | null>(null);
  const [nameEdit, setNameEdit] = useState<string | null>(null); // null = use the suggested name
  const [error2, setError2] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [newIds, setNewIds] = useState<string[]>([]);

  // "Client - Colour", e.g. "Super - Blue" (the person can still type their own)
  const suggested = partyId && colourId ? `${partyName(partyId)} - ${colourName(colourId)}` : '';
  const displayName = nameEdit ?? suggested;

  const create = useMutation({
    mutationFn: () => createPalliApi({ party_id: partyId!, bobbin_colour_id: colourId!, display_name: displayName.trim() }),
    onSuccess: async (palli) => {
      setNewIds((ids) => [palli.id, ...ids]);
      setPartyId(null);
      setColourId(null);
      setNameEdit(null);
      setError2(null);
      await qc.invalidateQueries({ queryKey: ['lookups'] });
      onToast(`Palli "${palli.display_name}" created`, 'success');
    },
    onError: (e: Error) => setError2(e.message || 'Could not create the Palli.'),
  });

  const submit = () => {
    setError2(null);
    if (!partyId) return setError2('Choose the client.');
    if (!colourId) return setError2('Choose the bobbin colour.');
    if (!displayName.trim()) return setError2('Enter a display name.');
    create.mutate();
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...pallis]
      .filter((p) => !q || p.display_name.toLowerCase().includes(q) || partyName(p.party_id).toLowerCase().includes(q))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pallis, search, lookups]);

  const columns: Column<Palli>[] = [
    {
      key: 'name',
      label: 'Client + colour',
      flex: 2.2,
      strong: true,
      render: (p) => (
        <View style={styles.nameCell}>
          <Text style={styles.nameText} numberOfLines={2}>{p.display_name}</Text>
          {newIds.includes(p.id) ? <Text style={styles.newTag}>New</Text> : null}
        </View>
      ),
    },
    { key: 'party', label: 'Client', flex: 1.6, render: (p) => partyName(p.party_id) },
    { key: 'colour', label: 'Bobbin colour', flex: 1.2, render: (p) => colourName(p.bobbin_colour_id) },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <View style={styles.headText}>
          <Text style={styles.heading}>Pallis</Text>
          <Text style={styles.sub}>A client + bobbin colour combination. Packaging packs bags against these.</Text>
        </View>
        <View style={styles.countChip} accessibilityLabel={`${pallis.length} pallis`}>
          <Text style={styles.countValue}>{pallis.length}</Text>
          <Text style={styles.countLabel}>{pallis.length === 1 ? 'palli' : 'pallis'}</Text>
        </View>
      </View>

      {/* Create */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Add a Palli</Text>
        <SelectField
          label="Client"
          placeholder="Select client"
          sheetTitle="Client"
          searchPlaceholder="Search"
          options={parties.map((p) => ({ id: p.id, title: p.name }))}
          value={partyId}
          onChange={setPartyId}
          emptyText="No clients available"
        />
        <SelectField
          label="Bobbin colour"
          placeholder="Select bobbin colour"
          sheetTitle="Bobbin colour"
          searchable={false}
          options={colours.map((c) => ({ id: c.id, title: c.name }))}
          value={colourId}
          onChange={setColourId}
          emptyText="No bobbin colours available"
        />
        <GateInput
          label="Display name"
          value={displayName}
          onChangeText={(t) => {
            setNameEdit(t);
            setError2(null);
          }}
          placeholder="e.g. Super - Blue"
        />
        {error2 ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Text style={styles.errorText}>{error2}</Text>
          </View>
        ) : null}
        <GateButton label="Create Palli" loading={create.isPending} onPress={submit} testID="create-palli-btn" />
      </View>

      {/* Every Palli */}
      <View style={styles.listHead}>
        <Text style={styles.listTitle}>All pallis</Text>
        {!isLoading && pallis.length > 0 ? <Text style={styles.listCount}>{rows.length} of {pallis.length}</Text> : null}
      </View>
      {pallis.length > 5 || search ? (
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name or client"
          placeholderTextColor={GateColors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      ) : null}

      {isLoading ? (
        <ActivityIndicator size="small" color={GateColors.primary} style={{ marginVertical: 24 }} />
      ) : isError ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Could not load the pallis</Text>
          <Text style={styles.stateSub}>{(error as Error)?.message ?? 'Something went wrong.'}</Text>
          <TouchableOpacity style={styles.retry} onPress={() => refetch()}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : pallis.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>No pallis yet</Text>
          <Text style={styles.stateSub}>Add the first one above. It appears here and in every packaging picker.</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>No pallis match</Text>
          <Text style={styles.stateSub}>Try a different search.</Text>
        </View>
      ) : (
        <DataTable columns={columns} rows={rows} getKey={(p) => p.id} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headText: { flex: 1, minWidth: 0 },
  heading: { fontSize: 20, fontWeight: '700', color: GateColors.textPrimary },
  sub: { fontSize: 13, lineHeight: 18, color: GateColors.textSecondary, marginTop: 2 },
  countChip: { alignItems: 'center', minWidth: 64, paddingHorizontal: 14, paddingVertical: 8, borderRadius: GateRadius.lg, backgroundColor: GateColors.primaryLight },
  countValue: { fontSize: 22, fontWeight: '800', color: GateColors.primary },
  countLabel: { fontSize: 11, fontWeight: '600', color: GateColors.primary },
  card: { backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderRadius: GateRadius.lg, padding: 16, gap: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: GateColors.textPrimary },
  errorBox: { backgroundColor: GateColors.dangerLight, borderWidth: 1, borderColor: GateColors.danger, borderRadius: GateRadius.md, padding: 12 },
  errorText: { color: GateColors.danger, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  listTitle: { fontSize: 16, fontWeight: '700', color: GateColors.textPrimary },
  listCount: { fontSize: 12, color: GateColors.textSecondary },
  search: { minHeight: 44, backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface4, borderRadius: GateRadius.md, paddingHorizontal: 12, fontSize: 15, color: GateColors.textPrimary },
  nameCell: { gap: 3 },
  nameText: { fontSize: 13, fontWeight: '700', color: GateColors.textPrimary },
  newTag: { alignSelf: 'flex-start', fontSize: 10, fontWeight: '800', color: GateColors.success, backgroundColor: GateColors.successLight, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, overflow: 'hidden' },
  stateCard: { backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderStyle: 'dashed', borderRadius: GateRadius.lg, padding: 26, alignItems: 'center', gap: 6 },
  stateTitle: { fontSize: 15, fontWeight: '700', color: GateColors.textPrimary, textAlign: 'center' },
  stateSub: { fontSize: 13, color: GateColors.textSecondary, textAlign: 'center', maxWidth: 300 },
  retry: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: GateRadius.md, backgroundColor: GateColors.primary },
  retryText: { color: GateColors.onPrimary, fontWeight: '700', fontSize: 14 },
});
