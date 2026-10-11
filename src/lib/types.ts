// ─── API Types ──────────────────────────────────────────────────────────────

export type Purpose = 'UNLOADING' | 'LOADING';
export type VehicleStatus = 'ON_PREMISES' | 'EXITED';

export type UserRole =
  | 'GATEMAN'
  | 'GODOWN_MANAGER_RM'
  | 'SUPERVISOR'
  | 'GODOWN_MANAGER_PKG'
  | 'GM_MD_ADMIN';

export interface LoginRequest {
  employee_code?: string;
  email?: string;
  secret: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  role: string;
  full_name: string;
}

export interface Gate {
  id: string;
  code: string;
  name: string;
}

export interface Party {
  id: string;
  name: string;
  contact_phone?: string;
  party_type?: string;
}

export interface MaterialVariety {
  id: string;
  name: string;
  /** Mixing column this material normally goes into (e.g. P/C, Break Comber). */
  default_mixing_category_id?: string | null;
}

export interface MixingCategory {
  id: string;
  name: string;
  code: string;
  sort_order: number;
  kind: 'FIBRE' | 'WASTE';
}

export interface Palli {
  id: string;
  party_id: string;
  bobbin_colour_id: string;
  display_name: string; // e.g. "Super - Blue"
}

export interface LookupsResponse {
  gates: Gate[];
  parties: Party[];
  material_varieties: MaterialVariety[];
  godown_locations?: Array<{ id: string; code: string; name: string }>;
  /** Ordered by sort_order. FIBRE columns are scanned bales; WASTE is typed-in weight. */
  mixing_categories?: MixingCategory[];
  yarn_counts?: Array<{ id: string; label: string }>;
  standard_mixing_recipe?: StandardRecipeLine[];
  cone_types?: ConeType[];
  bobbin_colours?: BobbinColour[];
  /** Client + bobbin colour combinations packaging packs bags against. */
  pallis?: Palli[];
  machines?: Array<{ id: string; code: string; process_type: string }>;
}

export interface VehicleStatusOut {
  gate_entry_id: string;
  id?: string; // alias mapped in client
  entry_code: string;
  vehicle_number: string;
  party_id: string | null;
  purpose: Purpose;
  gate_id: string;
  current_status: VehicleStatus;
  entered_at: string;
  exited_at: string | null;
  photo_url: string;
  bill_photo_url?: string | null;
  driver_name?: string | null;
  driver_mobile?: string | null;
  party_name?: string | null;
  material_variety_id?: string | null;
  material_variety_name?: string | null;
  approx_bale_count?: number | null;
  invoice_number?: string | null;
}

export interface EntryOut {
  id: string;
  entry_code: string;
  gate_id: string;
  vehicle_number: string;
  party_id: string | null;
  purpose: Purpose;
  driver_name: string | null;
  driver_mobile: string | null;
  material_variety_id: string | null;
  approx_bale_count: number | null;
  invoice_number: string | null;
  photo_url: string;
  /** Signed URL of the bill photo, or null if none was attached. */
  bill_photo_url?: string | null;
  recorded_by: string;
  created_at: string;
}

export interface ExitOut {
  id: string;
  gate_entry_id: string;
  exited_at: string;
  recorded_by: string;
  created_at: string;
}

export interface EntryIn {
  id: string; // client-generated uuid v4
  vehicle_number: string;
  purpose: Purpose;
  photo_url: string;
  /** Bill photo URL from /gate/uploads/presign-bill. Omit the key when no bill photo was taken. */
  bill_photo_url?: string;
  party_id?: string;
  driver_name?: string;
  driver_mobile?: string;
  material_variety_id?: string;
  approx_bale_count?: number;
  invoice_number?: string;
}

export interface PresignResponse {
  upload_url: string;
  photo_url: string;
}

// ─── Filter/Query Types ──────────────────────────────────────────────────────

export interface EntriesFilter {
  purpose?: Purpose;
  status?: VehicleStatus;
}

// ─── Offline Queue ───────────────────────────────────────────────────────────

export interface QueuedEntry {
  entry: EntryIn;
  queuedAt: string;
}

// ─── Auth Session ────────────────────────────────────────────────────────────

export interface AuthSession {
  token: string;
  fullName: string;
  role: string;
}

// ─── Admin Types ─────────────────────────────────────────────────────────────

export interface UserIn {
  employee_code: string;
  full_name: string;
  role: UserRole;
  secret: string;
  email?: string | null;
  phone?: string | null;
  gate_id?: string | null;
  godown_type_scope?: 'RAW_MATERIAL' | 'FINISHED_GOODS' | null;
}

export interface UserOut {
  id: string;
  employee_code: string;
  full_name: string;
  role: UserRole;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface UserUpdateIn {
  role?: UserRole;
  status?: 'ACTIVE' | 'INACTIVE';
  secret?: string;
}

export interface PalliIn {
  party_id: string;
  bobbin_colour_id: string;
  display_name: string;
}

export interface PalliOut {
  id: string;
  party_id: string;
  bobbin_colour_id: string;
  display_name: string;
  is_active: boolean;
}

export interface AdminInventoryRowOut {
  godown_location_id: string;
  location_name: string;
  material_variety_id: string;
  variety_name: string;
  quality_grade: 'A' | 'B' | 'C';
  bale_count: number;
  total_weight_kg: string;
}

export interface ProductionSummaryRowOut {
  production_date: string;
  shift_name: string;
  machine_code: string;
  process_type: string;
  efficiency_pct?: string | number;
  production_kg?: string | number;
  breakage_count?: number;
}

export interface ReconciliationRowOut {
  as_of_date: string;
  raw_material_received_kg: string;
  issued_to_blow_room_kg: string;
  finished_and_packed_kg: string;
  dispatched_kg: string;
}

// ─── Godown Types ────────────────────────────────────────────────────────────

export interface BaleIn {
  id: string; // client-generated uuid
  gate_entry_id: string;
  gross_weight_kg: number | string;
  tare_weight_kg: number | string;
  quality_grade: 'A' | 'B' | 'C';
  material_variety_id: string;
  party_id: string;
  godown_location_id: string;
}

export interface BaleOut {
  id: string;
  bale_code: string;
  gate_entry_id: string;
  gross_weight_kg: string;
  tare_weight_kg: string;
  net_weight_kg: string;
  quality_grade: 'A' | 'B' | 'C';
  material_variety_id: string;
  party_id: string;
  godown_location_id: string;
  qr_payload: string | null;
  recorded_by: string;
  created_at: string;
  printed: boolean;
}

export interface PrintOut {
  id: string;
  bale_id: string;
  printed_by: string;
  printed_at: string;
}

export interface VehicleUnloadConfig {
  party_id: string;
  party_name?: string;
  material_variety_id: string;
  material_variety_name?: string;
  godown_location_id: string;
  godown_location_name?: string;
  tare_weight_grams: string; // Tare in grams (e.g. "3800" g = 3.80 kg)
  tare_weight_kg?: string;
  quality_grade: 'A' | 'B' | 'C';
}

export interface GodownInventoryRowOut {
  location: string;
  variety: string;
  quality_grade: 'A' | 'B' | 'C';
  bale_count: number;
  total_kg: string;
}

export interface MixingLotOut {
  id: string;
  lot_code: string;
  target_weight_kg: string;
  current_status: 'BUILDING' | 'ACTIVE' | 'CONSUMED' | 'CANCELLED' | null;
  scanned_kg: string;
  bale_count: number;
}

/** One recipe line of a lot as returned by GET /godown/mixing-lots/{id}. */
export interface RecipeItemOut {
  category: string; // mixing category NAME
  target_percentage: string;
  target_weight_kg: string;
  scanned_kg: string;
}

/** One bale scanned into a lot. */
export interface MixingScanRowOut extends ScanOut {
  bale_code: string;
  party_name: string;
}

export interface MixingLotDetailOut {
  recipe: RecipeItemOut[];
  bales: MixingScanRowOut[];
  waste: WasteOut[];
}

/** A single bale currently sitting in a godown (GET /godown/stock-bales). */
export interface StockBaleOut {
  id: string;
  bale_code: string;
  gate_entry_id: string;
  vehicle_number: string;
  party_id: string;
  party_name: string;
  material_variety_id: string;
  material_variety_name: string;
  default_mixing_category_id: string | null;
  quality_grade: 'A' | 'B' | 'C';
  godown_location_id: string;
  godown_location_name: string;
  gross_weight_kg: string;
  tare_weight_kg: string;
  net_weight_kg: string;
  qr_payload: string | null;
  printed: boolean;
  created_at: string;
}

/** Own-waste entry typed into a lot (the WASTE column). */
export interface WasteOut {
  id: string;
  mixing_lot_id: string;
  mixing_category_id: string;
  weight_kg: string;
  note: string | null;
  recorded_by: string;
  created_at: string;
}

/** The recipe is no longer sent: the company-wide standard recipe is applied by the server. */
export interface MixingLotIn {
  id: string;
  count_id: string;
  target_weight_kg: number | string;
}

/** One line of the standard recipe (percentages only; weights depend on the lot target). */
export interface StandardRecipeLine {
  mixing_category_id: string;
  category_name: string;
  target_percentage: string;
}

export interface ScanIn {
  id: string;
  bale_id: string;
  mixing_category_id: string;
}

export interface ScanOut {
  id: string;
  mixing_lot_id: string;
  bale_id: string;
  mixing_category_id: string;
  net_weight_kg: string;
  scanned_by: string;
  occurred_at: string;
  created_at: string;
}


export interface StatusEventOut {
  id: string;
  mixing_lot_id: string;
  status: 'BUILDING' | 'ACTIVE' | 'CONSUMED' | 'CANCELLED';
  note: string | null;
  recorded_by: string;
  occurred_at: string;
  created_at: string;
}

/**
 * GET /admin/analytics/stock-summary. Levels (inventory, WIP, packaging) are as of
 * `as_of_date`; flows (received, production, dispatched) cover start_date..end_date.
 * The WIP parts and inventory are independent numbers.
 */
export interface StockSummaryOut {
  as_of_date: string | null;
  start_date: string | null;
  end_date: string | null;
  raw_material_received_kg: string;
  total_inventory_kg: string;
  total_wip_raw_material_kg: string;
  total_wip_own_waste_kg: string;
  total_wip_kg: string;
  total_production_kg: string;
  packaging_inventory_kg: string;
  dispatched_kg: string;
}

// ─── Supervisor ──────────────────────────────────────────────────────────────

export type ProcessType = 'OE' | 'CARD' | 'DRAW_FRAME';
export type ShiftCode = 'SHIFT_A' | 'SHIFT_B';

export interface ConeType {
  id: string;
  bundle_count: number;
  net_weight_kg: string;
}

export interface BobbinColour {
  id: string;
  name: string;
}

export interface SupervisorMachine {
  id: string;
  machine_code: string;
  process_type: ProcessType;
  display_no: number;
  rotor_count: number | null;
  is_active: boolean;
  created_at: string;
}

export interface ShiftLogIn {
  id: string; // client-generated uuid v4 (offline idempotency key)
  machine_id: string;
  shift_date: string; // YYYY-MM-DD
  shift_code: ShiftCode;
  production_kg: string;
  efficiency_pct: string;
  total_breakage?: number;
  run_time_hours?: string | null;
  idle_time_hours?: string | null; // Card only
  del?: string | null;
  rotor_speed?: number | null; // O/E only
  jsi_pct?: string | null; // O/E only
  detention_note?: string | null;
  count_id?: string | null; // O/E and Draw Frame
  correction_of_id?: string | null;
  correction_note?: string | null;
}

export interface ShiftLogOut {
  id: string;
  machine_id: string;
  shift_date: string;
  shift_code: ShiftCode;
  count_id: string | null;
  del: string | null;
  rotor_speed: number | null;
  production_kg: string;
  efficiency_pct: string;
  total_breakage: number;
  run_time_hours: string | null;
  idle_time_hours: string | null;
  jsi_pct: string | null;
  detention_note: string | null;
  correction_of_id: string | null;
  correction_note: string | null;
  recorded_by: string;
  created_at: string;
}

export interface ShiftSubmissionOut {
  id: string;
  shift_date: string;
  shift_code: ShiftCode;
  submitted_by: string;
  submitted_at: string;
}

export interface DoffIn {
  id: string;
  machine_id: string;
  count_id: string;
  cone_type_id: string;
  bobbin_colour_id: string;
  rotor_count: number;
}

export interface DoffOut {
  id: string;
  doff_code: string;
  machine_id: string;
  count_id: string;
  cone_type_id: string;
  bobbin_colour_id: string;
  rotor_count: number;
  loose_stock_kg: string;
  previous_doff_id: string | null;
  recorded_by: string;
  occurred_at: string;
  created_at: string;
}

export interface DoffIntervalOut {
  doff_id: string;
  machine_id: string;
  occurred_at: string;
  previous_occurred_at: string | null;
  hours_since_previous: string | null;
}


// ─── Packaging ───────────────────────────────────────────────────────────────

/** The paper register counts WHOLE CONES by eye, so every figure here is a cone count. */
export interface PaperLogIn {
  log_date: string;
  count_id: string;
  palli_id: string;
  cone_type_id: string;
  bobbin_colour_id: string;
  loose_cones: number;
  packed_cones: number;
  dispatched_cones: number;
  closing_cones: number;
}

export interface PaperLogOut extends PaperLogIn {
  id: string;
  /** Derived from the row's own cone type (calculated on the fly, secondary information). */
  kg_per_cone: string;
  loose_kg_equivalent: string;
  packed_kg_equivalent: string;
  dispatched_kg_equivalent: string;
  closing_kg_equivalent: string;
  recorded_by: string;
  created_at: string;
  updated_at: string;
}

export interface LooseStockRowOut {
  count_id: string;
  cone_type_id: string;
  bobbin_colour_id: string;
  available_kg: string;
}

export interface PackIn {
  id: string;
  count_id: string;
  palli_id: string;
  bobbin_colour_id: string;
  cone_type_id: string;
  net_weight_kg: string;
  cone_weights?: string[];
}

export interface PackagingRecordOut {
  id: string;
  bag_code: string;
  count_id: string;
  palli_id: string;
  bobbin_colour_id: string;
  cone_type_id: string;
  target_weight_kg: string;
  net_weight_kg: string;
  packed_by: string;
  packed_at: string;
  created_at: string;
}

export interface DispatchEntryOut {
  id: string;
  dispatch_code: string;
  gate_entry_id: string;
  party_id: string;
  dispatch_qr: string | null;
  generated_by: string;
  generated_at: string;
  created_at: string;
}

export interface DispatchLineOut {
  id: string;
  dispatch_entry_id: string;
  count_id: string;
  palli_id: string;
  bag_count: number;
  approx_weight_kg: string | null;
  created_at: string;
}

export interface BagAssignOut {
  id: string;
  dispatch_line_id: string;
  packaging_record_id: string;
  created_at: string;
}

/** A bag assigned to a dispatch line, as read back from the server. */
export interface DispatchLineBagOut {
  id: string;
  dispatch_line_id: string;
  packaging_record_id: string;
  bag_code: string;
  net_weight_kg: string;
  created_at: string;
}

/** The full current state of one dispatch (GET /packaging/dispatch-entries/{id}). */
export interface DispatchDetailOut {
  dispatch: DispatchEntryOut;
  lines: DispatchLineOut[];
  bags: DispatchLineBagOut[];
}

/** GET /supervisor/current-shift: the mill's actual shift right now (the server owns the 7 am / 7 pm boundary). */
export interface CurrentShiftOut {
  shift_date: string;
  shift_code: ShiftCode;
}

/** GET /supervisor/doff/total/{machine_id}: one machine's DOFF output during one shift. */
export interface DoffTotalOut {
  machine_id: string;
  shift_date: string;
  shift_code: ShiftCode;
  doff_count: number;
  total_loose_stock_kg: string;
}

// ─── Reports (frozen PDF sheets) ─────────────────────────────────────────────

export type ReportType = 'PRODUCTION' | 'MIXING' | 'PACKAGING';

/** One generated, permanent PDF sheet (GET /admin/reports). */
export interface GeneratedReportOut {
  id: string;
  report_type: ReportType;
  report_date: string;
  shift_code: ShiftCode | null; // PRODUCTION only
  reference_id: string;
  /** Signed link, valid for a limited time: always fetch the list fresh. */
  file_url: string;
  generated_by: string;
  generated_at: string;
}

/** POST /packaging/finalize-day */
export interface DayFinalizationOut {
  id: string;
  finalized_date: string;
  finalized_by: string;
  finalized_at: string;
}
