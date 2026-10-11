import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GateColors, GateRadius } from '@/constants/gateTheme';

export interface Column<T> {
  key: string;
  label: string;
  /** Relative width. The header and every row share it, so they always line up. */
  flex: number;
  /** Numbers should be 'right'; short badges 'center'. */
  align?: 'left' | 'right' | 'center';
  /** Cell content. Strings are styled for you; return an element for custom cells. */
  render: (row: T) => React.ReactNode;
  /** Emphasise the text (e.g. the main label or key figure). */
  strong?: boolean;
  accent?: boolean;
}

const ALIGN = { left: 'flex-start', right: 'flex-end', center: 'center' } as const;

/**
 * A compact table that fits the screen width (no sideways scrolling). The header
 * and the rows are drawn from the SAME column definitions with identical cell
 * padding, so columns cannot drift out of line.
 */
export function DataTable<T>({
  columns,
  rows,
  getKey,
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T, index: number) => string;
}) {
  return (
    <View style={styles.card}>
      <View style={[styles.row, styles.headRow]}>
        {columns.map((c) => (
          <View key={c.key} style={[styles.cell, { flex: c.flex, alignItems: ALIGN[c.align ?? 'left'] }]}>
            <Text style={[styles.th, { textAlign: c.align ?? 'left' }]} numberOfLines={2}>
              {c.label}
            </Text>
          </View>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={getKey(row, i)} style={[styles.row, i === rows.length - 1 && styles.lastRow]}>
          {columns.map((c) => {
            const content = c.render(row);
            return (
              <View key={c.key} style={[styles.cell, { flex: c.flex, alignItems: ALIGN[c.align ?? 'left'] }]}>
                {typeof content === 'string' || typeof content === 'number' ? (
                  <Text
                    style={[
                      styles.td,
                      { textAlign: c.align ?? 'left' },
                      c.strong && styles.strong,
                      c.accent && styles.accent,
                    ]}
                  >
                    {content}
                  </Text>
                ) : (
                  content
                )}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    borderRadius: GateRadius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface3,
  },
  lastRow: { borderBottomWidth: 0 },
  headRow: { backgroundColor: GateColors.surface2, borderBottomColor: GateColors.surface4 },
  // identical horizontal padding for header and body cells keeps columns aligned
  cell: { minWidth: 0, paddingHorizontal: 5, paddingVertical: 11, justifyContent: 'center' },
  th: { fontSize: 11, fontWeight: '700', color: GateColors.textSecondary, letterSpacing: 0 },
  td: { fontSize: 13, color: GateColors.textPrimary },
  strong: { fontWeight: '700' },
  accent: { color: GateColors.primary, fontWeight: '700' },
});
