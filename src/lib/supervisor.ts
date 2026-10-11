import type { ProcessType, ShiftCode, ShiftLogIn, ShiftLogOut } from './types';

export const PROCESS_TYPES: ProcessType[] = ['OE', 'CARD', 'DRAW_FRAME'];
export const PROCESS_LABEL: Record<ProcessType, string> = { OE: 'O/E', CARD: 'Card', DRAW_FRAME: 'Draw Frame' };
export const SHIFT_LABEL: Record<ShiftCode, string> = { SHIFT_A: 'Shift A · 7 am', SHIFT_B: 'Shift B · 7 pm' };

// A DOFF is expected about every 20 hours; far outside that usually means a missed or duplicate one.
// Compared against the time elapsed since the machine's LAST DOFF (not hours_since_previous).
export const DOFF_EXPECTED_HOURS = 20;
export const DOFF_WARN_BELOW_HOURS = 16;
export const DOFF_WARN_ABOVE_HOURS = 24;

// ─── Dates and shifts ────────────────────────────────────────────────────────

export { addDays, formatShiftDate, toISODate } from './dates';

// ─── Sheet model ─────────────────────────────────────────────────────────────

/** Every cell is held as text while the supervisor types. */
export interface RowValues {
  count_id: string;
  del: string;
  rotor_speed: string;
  production_kg: string;
  efficiency_pct: string;
  total_breakage: string;
  run_time_hours: string;
  idle_time_hours: string;
  jsi_pct: string;
  detention_note: string;
}

export const EMPTY_ROW: RowValues = {
  count_id: '',
  del: '',
  rotor_speed: '',
  production_kg: '',
  efficiency_pct: '',
  total_breakage: '',
  run_time_hours: '',
  idle_time_hours: '',
  jsi_pct: '',
  detention_note: '',
};

export interface SheetColumn {
  key: keyof RowValues;
  label: string;
  width: number;
  kind: 'decimal' | 'int' | 'select' | 'text';
  required?: boolean;
  /** Inclusive upper bound for numeric cells. */
  max?: number;
}

const COL = {
  count: { key: 'count_id', label: 'Count', width: 104, kind: 'select' },
  del: { key: 'del', label: 'D.E.L', width: 72, kind: 'decimal' },
  rotor: { key: 'rotor_speed', label: 'Rotor speed', width: 92, kind: 'int' },
  production: { key: 'production_kg', label: 'Production kg', width: 100, kind: 'decimal', required: true },
  eff: { key: 'efficiency_pct', label: 'Eff %', width: 72, kind: 'decimal', required: true, max: 100 },
  bkg: { key: 'total_breakage', label: 'Total Bkg', width: 80, kind: 'int' },
  run: { key: 'run_time_hours', label: 'Run time h', width: 84, kind: 'decimal', max: 12 },
  idle: { key: 'idle_time_hours', label: 'Idle time h', width: 84, kind: 'decimal', max: 12 },
  jsi: { key: 'jsi_pct', label: 'JSI %', width: 72, kind: 'decimal', max: 100 },
  note: { key: 'detention_note', label: 'Detention', width: 190, kind: 'text' },
} satisfies Record<string, SheetColumn>;

/** Columns mirror the paper "Production Sheet Day" for each process. */
export const SHEET_COLUMNS: Record<ProcessType, SheetColumn[]> = {
  OE: [COL.count, COL.del, COL.rotor, COL.production, COL.eff, COL.bkg, COL.run, COL.jsi, COL.note],
  CARD: [COL.del, COL.eff, COL.production, COL.bkg, COL.run, COL.idle, COL.note],
  DRAW_FRAME: [COL.count, COL.del, COL.eff, COL.production, COL.bkg, COL.run, COL.note],
};

const filled = (t: string) => t.trim() !== '';

/** A row with nothing typed (a Count picked in bulk doesn't count) is simply skipped. */
export function rowIsBlank(v: RowValues): boolean {
  return (Object.keys(v) as (keyof RowValues)[]).every((k) => k === 'count_id' || !filled(v[k]));
}

export function validateRow(processType: ProcessType, v: RowValues): string | null {
  for (const c of SHEET_COLUMNS[processType]) {
    const text = v[c.key].trim();
    if (!text) {
      if (c.required) return `${c.label} is required`;
      continue;
    }
    if (c.kind === 'decimal' || c.kind === 'int') {
      const re = c.kind === 'int' ? /^\d+$/ : /^\d+(\.\d+)?$/;
      if (!re.test(text)) return `${c.label} must be a ${c.kind === 'int' ? 'whole ' : ''}number`;
      if (c.max !== undefined && parseFloat(text) > c.max) return `${c.label} can't be more than ${c.max}`;
    }
  }
  return null;
}

const fixed = (t: string, d: number) => parseFloat(t).toFixed(d);

export function buildShiftLog(
  processType: ProcessType,
  base: { id: string; machine_id: string; shift_date: string; shift_code: ShiftCode },
  v: RowValues,
  extra: { correction_of_id?: string; correction_note?: string } = {}
): ShiftLogIn {
  const cols = new Set(SHEET_COLUMNS[processType].map((c) => c.key));
  const has = (k: keyof RowValues) => cols.has(k) && filled(v[k]);
  const row: ShiftLogIn = {
    ...base,
    production_kg: fixed(v.production_kg, 2),
    efficiency_pct: fixed(v.efficiency_pct, 2),
  };
  if (has('total_breakage')) row.total_breakage = parseInt(v.total_breakage, 10);
  if (has('run_time_hours')) row.run_time_hours = fixed(v.run_time_hours, 2);
  if (has('idle_time_hours')) row.idle_time_hours = fixed(v.idle_time_hours, 2);
  if (has('del')) row.del = v.del.trim();
  if (has('rotor_speed')) row.rotor_speed = parseInt(v.rotor_speed, 10);
  if (has('jsi_pct')) row.jsi_pct = fixed(v.jsi_pct, 2);
  if (has('detention_note')) row.detention_note = v.detention_note.trim();
  if (cols.has('count_id') && v.count_id) row.count_id = v.count_id;
  if (extra.correction_of_id) {
    row.correction_of_id = extra.correction_of_id;
    row.correction_note = extra.correction_note;
  }
  return row;
}

const trimZeros = (t: string | null) => (t === null ? '' : String(parseFloat(t)));

export function rowFromSaved(o: ShiftLogOut): RowValues {
  return {
    count_id: o.count_id ?? '',
    del: o.del ?? '',
    rotor_speed: o.rotor_speed === null ? '' : String(o.rotor_speed),
    production_kg: trimZeros(o.production_kg),
    efficiency_pct: trimZeros(o.efficiency_pct),
    total_breakage: String(o.total_breakage),
    run_time_hours: trimZeros(o.run_time_hours),
    idle_time_hours: trimZeros(o.idle_time_hours),
    jsi_pct: trimZeros(o.jsi_pct),
    detention_note: o.detention_note ?? '',
  };
}
