import React, { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
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
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GateColors, GateRadius } from '@/constants/gateTheme';

export interface SelectOption {
  id: string;
  title: string;
  subtitle?: string | null;
}

interface SelectFieldProps {
  label: string;
  optional?: boolean;
  placeholder: string;
  options: SelectOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  /** Sheet heading. Defaults to the field label. */
  sheetTitle?: string;
  searchPlaceholder?: string;
  /** Show a search box. Defaults to true when there are more than 6 options. */
  searchable?: boolean;
  emptyText?: string;
  testID?: string;
}

/**
 * A form field that looks like a select and opens a bottom sheet.
 *
 * The sheet slides up over a fading backdrop, is capped at 80% of the screen
 * and anchors to the bottom edge. Its height is a percentage of the container,
 * so when the keyboard resizes the window (Android) or is handled by
 * KeyboardAvoidingView (iOS) the sheet shrinks with it instead of being covered.
 */
export function SelectField({
  label,
  optional,
  placeholder,
  options,
  value,
  onChange,
  sheetTitle,
  searchPlaceholder = 'Search',
  searchable,
  emptyText = 'No results',
  testID,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value) ?? null;

  return (
    <View style={styles.group}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {optional ? <Text style={styles.optional}>optional</Text> : null}
      </View>

      <TouchableOpacity
        style={[styles.field, selected && styles.fieldSelected]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selected ? selected.title : 'not selected'}`}
        testID={testID}
      >
        <View style={styles.fieldText}>
          {selected ? (
            <>
              <Text style={styles.fieldValue} numberOfLines={1}>{selected.title}</Text>
              {selected.subtitle ? (
                <Text style={styles.fieldSub} numberOfLines={1}>{selected.subtitle}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.fieldPlaceholder} numberOfLines={1}>{placeholder}</Text>
          )}
        </View>
        {selected && optional ? (
          <TouchableOpacity
            onPress={() => onChange(null)}
            hitSlop={10}
            accessibilityLabel={`Clear ${label}`}
            style={styles.clearHit}
          >
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={styles.chevron}>▾</Text>
      </TouchableOpacity>

      <SelectSheet
        visible={open}
        title={sheetTitle ?? label}
        options={options}
        value={value}
        searchable={searchable ?? options.length > 6}
        searchPlaceholder={searchPlaceholder}
        emptyText={emptyText}
        onClose={() => setOpen(false)}
        onSelect={onChange}
      />
    </View>
  );
}

export function SelectSheet({
  visible,
  title,
  options,
  value,
  searchable,
  searchPlaceholder,
  emptyText,
  onClose,
  onSelect,
}: {
  visible: boolean;
  title: string;
  options: SelectOption[];
  value: string | null;
  searchable: boolean;
  searchPlaceholder: string;
  emptyText: string;
  onClose: () => void;
  onSelect: (id: string | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) return;
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, progress]);

  // Animate out, then tell the parent to unmount the sheet.
  const close = (after?: () => void) => {
    Animated.timing(progress, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setQuery('');
        onClose();
        after?.();
      }
    });
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(
        (o) => o.title.toLowerCase().includes(q) || (o.subtitle ?? '').toLowerCase().includes(q)
      )
    : options;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={() => close()} statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} accessibilityLabel="Close" />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              maxHeight: height * 0.8,
              paddingBottom: Math.max(insets.bottom, 12),
              transform: [
                {
                  translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [height * 0.8, 0] }),
                },
              ],
            },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={() => close()} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close">
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {searchable ? (
            <View style={styles.searchWrap}>
              <TextInput
                style={styles.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder={searchPlaceholder}
                placeholderTextColor={GateColors.textMuted}
                autoCorrect={false}
                autoCapitalize="none"
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
          ) : null}

          <ScrollView
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          >
            {filtered.length === 0 ? (
              <Text style={styles.empty}>{emptyText}</Text>
            ) : (
              filtered.map((o) => {
                const isSelected = o.id === value;
                return (
                  <TouchableOpacity
                    key={o.id}
                    style={[styles.item, isSelected && styles.itemSelected]}
                    onPress={() => close(() => onSelect(o.id))}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View style={styles.itemText}>
                      <Text style={[styles.itemTitle, isSelected && styles.itemTitleSelected]} numberOfLines={1}>
                        {o.title}
                      </Text>
                      {o.subtitle ? (
                        <Text style={styles.itemSub} numberOfLines={1}>{o.subtitle}</Text>
                      ) : null}
                    </View>
                    {isSelected ? <Text style={styles.check}>✓</Text> : null}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  group: { gap: 6 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: GateColors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  optional: { fontSize: 11, color: GateColors.textMuted, fontWeight: '500', fontStyle: 'italic' },

  field: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: GateColors.surface2,
    borderWidth: 1.5,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  fieldSelected: { backgroundColor: GateColors.surface1, borderColor: GateColors.primary },
  fieldText: { flex: 1, minWidth: 0 },
  fieldPlaceholder: { fontSize: 16, color: GateColors.textMuted },
  fieldValue: { fontSize: 16, fontWeight: '600', color: GateColors.textPrimary },
  fieldSub: { fontSize: 12, color: GateColors.textSecondary, marginTop: 1 },
  clearHit: { paddingHorizontal: 2 },
  clearText: { fontSize: 15, color: GateColors.textMuted },
  chevron: { fontSize: 16, color: GateColors.textSecondary },

  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: GateColors.overlay },
  sheet: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    backgroundColor: GateColors.surface1,
    borderTopLeftRadius: GateRadius.xl,
    borderTopRightRadius: GateRadius.xl,
    paddingTop: 8,
    flexShrink: 1,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: GateColors.surface4,
    marginBottom: 6,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: GateColors.textPrimary },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GateColors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { fontSize: 14, color: GateColors.textSecondary },
  searchWrap: { paddingHorizontal: 20, paddingBottom: 10 },
  searchInput: {
    minHeight: 44,
    backgroundColor: GateColors.surface2,
    borderRadius: GateRadius.md,
    paddingHorizontal: 14,
    fontSize: 15,
    color: GateColors.textPrimary,
  },
  list: { flexShrink: 1, flexGrow: 0 },
  listContent: { paddingBottom: 4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: GateColors.surface2,
  },
  itemSelected: { backgroundColor: GateColors.primaryLight },
  itemText: { flex: 1, minWidth: 0 },
  itemTitle: { fontSize: 16, fontWeight: '500', color: GateColors.textPrimary },
  itemTitleSelected: { fontWeight: '700', color: GateColors.primary },
  itemSub: { fontSize: 13, color: GateColors.textSecondary, marginTop: 2 },
  check: { fontSize: 18, fontWeight: '700', color: GateColors.primary },
  empty: { textAlign: 'center', color: GateColors.textMuted, paddingVertical: 32, fontSize: 14 },
});
