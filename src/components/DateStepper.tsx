import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { GateColors, GateRadius } from '@/constants/gateTheme';
import { addDays, formatShiftDate, toISODate } from '@/lib/dates';

/** Previous / next day stepper that always lands on a real calendar date (never beyond today). */
export function DateStepper({
  date,
  onChange,
  allowFuture = true,
}: {
  date: string;
  onChange: (iso: string) => void;
  allowFuture?: boolean;
}) {
  const today = toISODate(new Date());
  const atToday = !allowFuture && date >= today;
  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(addDays(date, -1))} accessibilityLabel="Previous day">
        <Text style={styles.stepText}>‹</Text>
      </TouchableOpacity>
      <View style={styles.box}>
        <Text style={styles.date}>{formatShiftDate(date)}</Text>
        {date !== today ? (
          <TouchableOpacity onPress={() => onChange(today)}>
            <Text style={styles.todayLink}>Back to today</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.todayTag}>Today</Text>
        )}
      </View>
      <TouchableOpacity
        style={[styles.stepBtn, atToday && styles.stepDisabled]}
        disabled={atToday}
        onPress={() => onChange(addDays(date, 1))}
        accessibilityLabel="Next day"
      >
        <Text style={styles.stepText}>›</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: GateRadius.md,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GateColors.surface1,
  },
  stepDisabled: { opacity: 0.35 },
  stepText: { fontSize: 22, lineHeight: 24, color: GateColors.textPrimary },
  box: { flex: 1, alignItems: 'center' },
  date: { fontSize: 17, fontWeight: '800', color: GateColors.textPrimary },
  todayTag: { fontSize: 11, fontWeight: '700', color: GateColors.success },
  todayLink: { fontSize: 11, fontWeight: '700', color: GateColors.primary },
});
