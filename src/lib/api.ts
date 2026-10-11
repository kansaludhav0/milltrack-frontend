import { router } from 'expo-router';

import { API_BASE_URL } from './constants';
import { clearSession, getToken } from './storage';
import type {
  AdminInventoryRowOut,
  BagAssignOut,
  CurrentShiftOut,
  DayFinalizationOut,
  GeneratedReportOut,
  ReportType,
  DoffTotalOut,
  DispatchDetailOut,
  DispatchEntryOut,
  DispatchLineOut,
  LooseStockRowOut,
  PackagingRecordOut,
  PackIn,
  PaperLogIn,
  PaperLogOut,
  DoffIn,
  DoffIntervalOut,
  DoffOut,
  ProcessType,
  ShiftCode,
  ShiftLogIn,
  ShiftLogOut,
  ShiftSubmissionOut,
  SupervisorMachine,
  BaleIn,
  BaleOut,
  EntryIn,
  EntryOut,
  EntriesFilter,
  ExitOut,
  GodownInventoryRowOut,
  LoginRequest,
  LoginResponse,
  LookupsResponse,
  MixingLotDetailOut,
  MixingLotIn,
  MixingLotOut,
  PalliIn,
  PalliOut,
  PresignResponse,
  PrintOut,
  ProductionSummaryRowOut,
  ReconciliationRowOut,
  ScanIn,
  ScanOut,
  StandardRecipeLine,
  StatusEventOut,
  StockBaleOut,
  StockSummaryOut,
  UserIn,
  UserOut,
  UserRole,
  UserUpdateIn,
  WasteOut,
  VehicleStatusOut,
} from './types';

// ─── Error Parsing ───────────────────────────────────────────────────────────

/**
 * Parse FastAPI error bodies — either {"detail": string} or
 * {"detail": [{msg, loc, ...}]}  (422 validation errors).
 */
export function parseApiError(body: unknown): string {
  if (typeof body !== 'object' || body === null) return 'An unexpected error occurred.';
  const b = body as Record<string, unknown>;
  if (typeof b.detail === 'string') return b.detail;
  if (Array.isArray(b.detail)) {
    return b.detail
      .map((e: unknown) => {
        if (typeof e === 'object' && e !== null && 'msg' in e) {
          return (e as Record<string, unknown>).msg as string;
        }
        return String(e);
      })
      .join('; ');
  }
  return 'An unexpected error occurred.';
}

// ─── Core Fetch ──────────────────────────────────────────────────────────────

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  gateId?: string;
  noAuth?: boolean;
}

async function apiFetch<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, gateId, noAuth = false } = opts;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (!noAuth) {
    try {
      const token = await getToken();
      console.log(`[API] token present: ${!!token}`);
      if (token) headers['Authorization'] = `Bearer ${token}`;
    } catch (e) {
      console.error('[API] getToken failed:', e);
    }
  }

  if (gateId) headers['X-Gate-Id'] = gateId;

  const url = `${API_BASE_URL}/api/v1${path}`;
  console.log(`[API] ${method} ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // fetch only rejects on network failure (offline, DNS, CORS, server down)
    throw new Error(`Cannot reach the server (${API_BASE_URL}). Check your connection and try again. [${(e as Error)?.message ?? 'network error'}]`);
  }

  if (!noAuth && response.status === 401) {
    await clearSession();
    router.replace('/login');
    throw new Error('Session expired. Please log in again.');
  }

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }
    const message = parseApiError(errorBody);
    const err = new Error(message);
    (err as ApiError).status = response.status;
    throw err;
  }

  // 204 No Content
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

export interface ApiError extends Error {
  status?: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function loginApi(body: LoginRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>('/auth/login', { method: 'POST', body, noAuth: true });
}

// ─── Config/Lookups ───────────────────────────────────────────────────────────

export async function getLookupsApi(): Promise<LookupsResponse> {
  return apiFetch<LookupsResponse>('/config/lookups');
}

// ─── Gate Entries ─────────────────────────────────────────────────────────────

export async function getEntriesApi(filters?: EntriesFilter): Promise<VehicleStatusOut[]> {
  const params = new URLSearchParams();
  if (filters?.purpose) params.set('purpose', filters.purpose);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  const raw = await apiFetch<VehicleStatusOut[]>(`/gate/entries${qs ? `?${qs}` : ''}`);
  return raw.map((item) => ({
    ...item,
    id: item.gate_entry_id || item.id,
  }));
}

export async function createEntryApi(entry: EntryIn, gateId: string): Promise<EntryOut> {
  return apiFetch<EntryOut>('/gate/entries', { method: 'POST', body: entry, gateId });
}

export async function exitVehicleApi(entryId: string): Promise<ExitOut> {
  return apiFetch<ExitOut>(`/gate/entries/${entryId}/exit`, { method: 'POST' });
}

// ─── Photo Upload ─────────────────────────────────────────────────────────────

export async function presignPhotoApi(): Promise<PresignResponse> {
  return apiFetch<PresignResponse>('/gate/uploads/presign', { method: 'POST' });
}

export async function presignBillApi(): Promise<PresignResponse> {
  return apiFetch<PresignResponse>('/gate/uploads/presign-bill', { method: 'POST' });
}

export async function uploadPhotoToS3(uploadUrl: string, fileUri: string): Promise<void> {
  console.log('[UPLOAD] Starting photo upload to S3 presigned URL:', uploadUrl.split('?')[0]);

  // Determine headers based on S3 presigned URL signature requirements
  const urlLower = uploadUrl.toLowerCase();
  const headers: Record<string, string> =
    urlLower.includes('x-amz-signedheaders=') && !urlLower.includes('content-type')
      ? {}
      : { 'Content-Type': 'image/jpeg' };

  // 1. Try native binary streaming via expo-file-system/legacy
  let uploadAsync: any = null;
  let FileSystemUploadType: any = null;
  try {
    const legacyFS = require('expo-file-system/legacy');
    uploadAsync = legacyFS.uploadAsync;
    FileSystemUploadType = legacyFS.FileSystemUploadType;
  } catch {
    try {
      const fs = require('expo-file-system');
      uploadAsync = fs.uploadAsync;
      FileSystemUploadType = fs.FileSystemUploadType;
    } catch {}
  }

  if (uploadAsync && FileSystemUploadType) {
    try {
      console.log('[UPLOAD] Uploading via FileSystem.uploadAsync with headers:', headers);
      const res = await uploadAsync(uploadUrl, fileUri, {
        httpMethod: 'PUT',
        headers,
        uploadType: FileSystemUploadType.BINARY_CONTENT,
      });
      console.log('[UPLOAD] uploadAsync response status:', res.status);
      if (res.status >= 200 && res.status < 300) {
        console.log('[UPLOAD] Photo upload succeeded via FileSystem.uploadAsync!');
        return;
      }
      // If 403 Forbidden (SignatureDoesNotMatch), retry with toggled Content-Type header
      if (res.status === 403) {
        const altHeaders = Object.keys(headers).length > 0 ? {} : { 'Content-Type': 'image/jpeg' };
        console.warn('[UPLOAD] 403 received, retrying with alternate headers:', altHeaders);
        const retryRes = await uploadAsync(uploadUrl, fileUri, {
          httpMethod: 'PUT',
          headers: altHeaders,
          uploadType: FileSystemUploadType.BINARY_CONTENT,
        });
        console.log('[UPLOAD] Retry status:', retryRes.status);
        if (retryRes.status >= 200 && retryRes.status < 300) {
          console.log('[UPLOAD] Photo upload succeeded on retry!');
          return;
        }
      }
      console.warn('[UPLOAD] FileSystem upload returned non-2xx status:', res.status, res.body);
    } catch (fsErr: any) {
      console.warn('[UPLOAD] FileSystem uploadAsync error, falling back to fetch blob:', fsErr?.message);
    }
  }

  // 2. Fallback to fetch + blob
  console.log('[UPLOAD] Fallback: creating Blob from local file URI...');
  const response = await fetch(fileUri);
  const blob = await response.blob();
  console.log('[UPLOAD] Created blob, size:', blob.size, 'type:', blob.type);

  let uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers,
    body: blob,
  });

  if (uploadResponse.status === 403) {
    const altHeaders: Record<string, string> =
      Object.keys(headers).length > 0 ? {} : { 'Content-Type': 'image/jpeg' };
    console.warn('[UPLOAD] 403 received on fetch, retrying with alternate headers:', altHeaders);
    uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: altHeaders,
      body: blob,
    });
  }

  if (!uploadResponse.ok) {
    const errText = await uploadResponse.text().catch(() => '');
    console.error('[UPLOAD] S3 upload error:', uploadResponse.status, errText);
    throw new Error(`Photo upload failed (${uploadResponse.status}): ${errText || uploadResponse.statusText}`);
  }
  console.log('[UPLOAD] Photo upload succeeded via fetch!');
}

// ─── Admin Endpoints ─────────────────────────────────────────────────────────

export interface UsersFilter {
  role?: UserRole;
  status?: 'ACTIVE' | 'INACTIVE';
  search?: string;
  limit?: number;
  offset?: number;
}

export async function getUsersApi(filters: UsersFilter = {}): Promise<UserOut[]> {
  const params = new URLSearchParams();
  if (filters.role) params.set('role', filters.role);
  if (filters.status) params.set('status', filters.status);
  if (filters.search?.trim()) params.set('search', filters.search.trim());
  if (filters.limit !== undefined) params.set('limit', String(filters.limit));
  if (filters.offset !== undefined) params.set('offset', String(filters.offset));
  const qs = params.toString();
  return apiFetch<UserOut[]>(`/admin/users${qs ? `?${qs}` : ''}`);
}

export async function createUserApi(user: UserIn): Promise<UserOut> {
  return apiFetch<UserOut>('/admin/users', { method: 'POST', body: user });
}

export async function updateUserApi(userId: string, data: UserUpdateIn): Promise<UserOut> {
  return apiFetch<UserOut>(`/admin/users/${userId}`, { method: 'PATCH', body: data });
}

export async function revokeUserTokensApi(userId: string): Promise<void> {
  return apiFetch<void>(`/admin/users/${userId}/revoke`, { method: 'POST' });
}

/** Replace the company-wide standard mixing recipe (percentages must total 100, FIBRE categories only). */
export async function setMixingRecipeApi(
  lines: Array<{ mixing_category_id: string; target_percentage: string }>
): Promise<StandardRecipeLine[]> {
  return apiFetch<StandardRecipeLine[]>('/admin/mixing-recipe', { method: 'PUT', body: { lines } });
}

// ─── Supervisor Endpoints ────────────────────────────────────────────────────

/** The shift in progress, decided by the server (it knows the mill's time zone and the 7 am / 7 pm boundary). */
export async function getCurrentShiftApi(): Promise<CurrentShiftOut> {
  return apiFetch<CurrentShiftOut>('/supervisor/current-shift');
}

/** Delete a machine added by mistake. 409 once anything has been recorded against it. */
export async function deleteSupervisorMachineApi(machineId: string): Promise<void> {
  return apiFetch<void>(`/supervisor/machines/${machineId}`, { method: 'DELETE' });
}

/** A machine's DOFF count and loose-stock kg during one shift. */
export async function getDoffTotalApi(machineId: string, shiftDate: string, shiftCode: ShiftCode): Promise<DoffTotalOut> {
  return apiFetch<DoffTotalOut>(
    `/supervisor/doff/total/${machineId}?shift_date=${encodeURIComponent(shiftDate)}&shift_code=${shiftCode}`
  );
}

/** Every active machine, same for all supervisors. includeInactive also returns retired ones (for old shifts). */
export async function getSupervisorMachinesApi(includeInactive = false): Promise<SupervisorMachine[]> {
  return apiFetch<SupervisorMachine[]>(`/supervisor/machines${includeInactive ? '?include_inactive=true' : ''}`);
}

/**
 * Add a machine the moment it exists on the floor. The server picks the next free
 * number. rotor_count is O/E only (400 for Card or Draw Frame).
 */
export async function createSupervisorMachineApi(
  processType: ProcessType,
  rotorCount?: number
): Promise<SupervisorMachine> {
  return apiFetch<SupervisorMachine>('/supervisor/machines', {
    method: 'POST',
    body: rotorCount !== undefined ? { process_type: processType, rotor_count: rotorCount } : { process_type: processType },
  });
}

/** One bulk call per process type. Each row carries its own client id, so retrying is safe. */
export async function submitShiftLogsApi(processType: ProcessType, rows: ShiftLogIn[]): Promise<ShiftLogOut[]> {
  return apiFetch<ShiftLogOut[]>(`/supervisor/shift-logs/${processType}`, { method: 'POST', body: rows });
}

export async function submitShiftApi(shiftDate: string, shiftCode: ShiftCode): Promise<ShiftSubmissionOut> {
  return apiFetch<ShiftSubmissionOut>('/supervisor/shift-submissions', {
    method: 'POST',
    body: { shift_date: shiftDate, shift_code: shiftCode },
  });
}

/** null when the machine has never been doffed. */
export async function getLastDoffApi(machineId: string): Promise<DoffIntervalOut | null> {
  return apiFetch<DoffIntervalOut | null>(`/supervisor/doff/last/${machineId}`);
}

export async function createDoffApi(doff: DoffIn): Promise<DoffOut> {
  return apiFetch<DoffOut>('/supervisor/doff', { method: 'POST', body: doff });
}

/** Each machine's CURRENT reading for a shift (corrections already resolved by the server). */
export async function getShiftLogsApi(
  processType: ProcessType,
  shiftDate: string,
  shiftCode: ShiftCode
): Promise<ShiftLogOut[]> {
  return apiFetch<ShiftLogOut[]>(
    `/supervisor/shift-logs/${processType}?shift_date=${encodeURIComponent(shiftDate)}&shift_code=${shiftCode}`
  );
}

/** The lock record for a shift, or null if it has not been submitted yet. */
export async function getShiftSubmissionApi(
  shiftDate: string,
  shiftCode: ShiftCode
): Promise<ShiftSubmissionOut | null> {
  return apiFetch<ShiftSubmissionOut | null>(
    `/supervisor/shift-submissions?shift_date=${encodeURIComponent(shiftDate)}&shift_code=${shiftCode}`
  );
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export interface ReportsFilter {
  reportType?: ReportType;
  startDate?: string;
  endDate?: string;
}

/** Every generated PDF sheet, newest first. Links are signed and expire, so fetch fresh. */
export async function getReportsApi(f: ReportsFilter = {}): Promise<GeneratedReportOut[]> {
  const q = new URLSearchParams();
  if (f.reportType) q.set('report_type', f.reportType);
  if (f.startDate) q.set('start_date', f.startDate);
  if (f.endDate) q.set('end_date', f.endDate);
  const qs = q.toString();
  return apiFetch<GeneratedReportOut[]>(`/admin/reports${qs ? `?${qs}` : ''}`);
}

// ─── Packaging Endpoints ─────────────────────────────────────────────────────

/** Freeze a day's paper log into a permanent Packaging Sheet. Repeating it for the same day is harmless. */
export async function finalizePackagingDayApi(finalizedDate: string): Promise<DayFinalizationOut> {
  return apiFetch<DayFinalizationOut>('/packaging/finalize-day', { method: 'POST', body: { finalized_date: finalizedDate } });
}

/** Shared, unclaimed loose stock (yarn cones not yet packed for any client), by count / cone type / bobbin colour. */
export async function getLooseStockApi(): Promise<LooseStockRowOut[]> {
  return apiFetch<LooseStockRowOut[]>('/packaging/loose-stock');
}

/** Pack one bag. The client id makes a retry safe. */
export async function packBagApi(bag: PackIn): Promise<PackagingRecordOut> {
  return apiFetch<PackagingRecordOut>('/packaging/records', { method: 'POST', body: bag });
}

/** Bags packed TODAY. */
export async function getPackedTodayApi(): Promise<PackagingRecordOut[]> {
  return apiFetch<PackagingRecordOut[]>('/packaging/records');
}

/** Every packed bag not yet on any dispatch, from ANY day. Optional filters narrow it to one line's spec. */
export async function getAvailableBagsApi(f: { count_id?: string; palli_id?: string; cone_type_id?: string } = {}): Promise<PackagingRecordOut[]> {
  const q = new URLSearchParams();
  Object.entries(f).forEach(([k, v]) => v && q.set(k, v));
  const qs = q.toString();
  return apiFetch<PackagingRecordOut[]>(`/packaging/records/available${qs ? `?${qs}` : ''}`);
}

/** Dispatches opened on one day (today when no date is given). */
export async function getDispatchesApi(dispatchDate?: string): Promise<DispatchEntryOut[]> {
  return apiFetch<DispatchEntryOut[]>(`/packaging/dispatch-entries${dispatchDate ? `?dispatch_date=${encodeURIComponent(dispatchDate)}` : ''}`);
}

/** Where a dispatch stands right now: its lines and every bag assigned. 404 if it does not exist. */
export async function getDispatchApi(dispatchId: string): Promise<DispatchDetailOut> {
  return apiFetch<DispatchDetailOut>(`/packaging/dispatch-entries/${dispatchId}`);
}

/** LOADING-purpose vehicles still on the premises. */
export async function getLoadingVehiclesApi(): Promise<VehicleStatusOut[]> {
  return apiFetch<VehicleStatusOut[]>('/packaging/loading-vehicles');
}

export async function createDispatchApi(d: { id: string; gate_entry_id: string; party_id: string }): Promise<DispatchEntryOut> {
  return apiFetch<DispatchEntryOut>('/packaging/dispatch-entries', { method: 'POST', body: d });
}

export async function addDispatchLineApi(
  dispatchId: string,
  line: { count_id: string; palli_id: string; bag_count: number; approx_weight_kg?: string | null }
): Promise<DispatchLineOut> {
  return apiFetch<DispatchLineOut>(`/packaging/dispatch-entries/${dispatchId}/lines`, { method: 'POST', body: line });
}

/** 409 if the bag has already been dispatched. */
export async function assignBagApi(lineId: string, packagingRecordId: string): Promise<BagAssignOut> {
  return apiFetch<BagAssignOut>(`/packaging/dispatch-lines/${lineId}/bags`, {
    method: 'POST',
    body: { packaging_record_id: packagingRecordId },
  });
}

/** What the paper register says for one day. Saving the same day/count/client+colour/cone overwrites it. */
export async function putPaperLogApi(entry: PaperLogIn): Promise<PaperLogOut> {
  return apiFetch<PaperLogOut>('/packaging/paper-log', { method: 'PUT', body: entry });
}

export async function getPaperLogApi(logDate?: string): Promise<PaperLogOut[]> {
  return apiFetch<PaperLogOut[]>(`/packaging/paper-log${logDate ? `?log_date=${encodeURIComponent(logDate)}` : ''}`);
}

export async function createPalliApi(data: PalliIn): Promise<PalliOut> {
  return apiFetch<PalliOut>('/admin/pallis', { method: 'POST', body: data });
}

export async function getAdminInventoryApi(): Promise<AdminInventoryRowOut[]> {
  return apiFetch<AdminInventoryRowOut[]>('/admin/analytics/inventory');
}

export async function getAdminProductionSummaryApi(): Promise<ProductionSummaryRowOut[]> {
  return apiFetch<ProductionSummaryRowOut[]>('/admin/analytics/production-summary');
}

export async function getAdminReconciliationApi(): Promise<ReconciliationRowOut[]> {
  return apiFetch<ReconciliationRowOut[]>('/admin/analytics/reconciliation');
}

export async function getAdminTraceApi(code: string): Promise<unknown> {
  return apiFetch<unknown>(`/admin/trace/${encodeURIComponent(code)}`);
}

// ─── Godown Endpoints ────────────────────────────────────────────────────────

export async function getUnloadingQueueApi(): Promise<VehicleStatusOut[]> {
  const raw = await apiFetch<VehicleStatusOut[]>('/godown/unloading-queue');
  return raw.map((item) => ({
    ...item,
    id: item.gate_entry_id || item.id,
  }));
}

export async function getBalesForEntryApi(entryId: string): Promise<BaleOut[]> {
  return apiFetch<BaleOut[]>(`/godown/entries/${entryId}/bales`);
}

export async function createBaleApi(bale: BaleIn): Promise<BaleOut> {
  return apiFetch<BaleOut>('/godown/bales', { method: 'POST', body: bale });
}

export async function printBaleApi(baleId: string): Promise<PrintOut> {
  return apiFetch<PrintOut>(`/godown/bales/${baleId}/print`, { method: 'POST' });
}

export async function getGodownInventoryApi(): Promise<GodownInventoryRowOut[]> {
  return apiFetch<GodownInventoryRowOut[]>('/godown/inventory');
}

export interface StockBalesFilter {
  party_id?: string;
  material_variety_id?: string;
  godown_location_id?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/** Individual bales currently in godown stock. */
export async function getStockBalesApi(filters: StockBalesFilter = {}): Promise<StockBaleOut[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return apiFetch<StockBaleOut[]>(`/godown/stock-bales${qs ? `?${qs}` : ''}`);
}

/** Change the tare of every bale already weighed for a vehicle (409 if any is in a lot). */
export async function retareEntryBalesApi(entryId: string, tareWeightKg: string): Promise<BaleOut[]> {
  return apiFetch<BaleOut[]>(`/godown/entries/${entryId}/bales/tare`, {
    method: 'PATCH',
    body: { tare_weight_kg: tareWeightKg },
  });
}

export async function voidBaleApi(baleId: string, reason?: string): Promise<void> {
  return apiFetch<void>(`/godown/bales/${baleId}/void`, {
    method: 'POST',
    body: reason ? { reason } : {},
  });
}

/** Return a scanned bale to godown stock (lot must be BUILDING). scanId = MixingScanRowOut.id */
export async function unscanBaleApi(lotId: string, scanId: string): Promise<void> {
  return apiFetch<void>(`/godown/mixing-lots/${lotId}/scan/${scanId}`, { method: 'DELETE' });
}

export async function addWasteApi(
  lotId: string,
  waste: { id: string; weight_kg: string; note?: string | null }
): Promise<WasteOut> {
  return apiFetch<WasteOut>(`/godown/mixing-lots/${lotId}/waste`, { method: 'POST', body: waste });
}

export async function removeWasteApi(lotId: string, wasteId: string): Promise<void> {
  return apiFetch<void>(`/godown/mixing-lots/${lotId}/waste/${wasteId}`, { method: 'DELETE' });
}

export async function getMixingLotDetailApi(lotId: string): Promise<MixingLotDetailOut> {
  return apiFetch<MixingLotDetailOut>(`/godown/mixing-lots/${lotId}`);
}

export async function getMixingLotsApi(): Promise<MixingLotOut[]> {
  return apiFetch<MixingLotOut[]>('/godown/mixing-lots');
}

export async function createMixingLotApi(lot: MixingLotIn): Promise<MixingLotOut> {
  return apiFetch<MixingLotOut>('/godown/mixing-lots', { method: 'POST', body: lot });
}

export async function scanBaleIntoMixingApi(lotId: string, scan: ScanIn): Promise<ScanOut> {
  return apiFetch<ScanOut>(`/godown/mixing-lots/${lotId}/scan`, { method: 'POST', body: scan });
}

/**
 * The ONLY lot action a Godown Manager has: mark the lot complete (it becomes
 * Admin-tracked WIP). POST .../status is Admin-only and must not be called here.
 */
export async function completeMixingLotApi(lotId: string): Promise<StatusEventOut> {
  return apiFetch<StatusEventOut>(`/godown/mixing-lots/${lotId}/complete`, { method: 'POST', body: {} });
}

/** Take a vehicle off the unloading queue. Does NOT exit it through the gate. */
export async function finishUnloadingApi(entryId: string): Promise<void> {
  return apiFetch<void>(`/godown/entries/${entryId}/finish-unloading`, { method: 'POST', body: {} });
}

/** Admin: the three governing numbers (inventory, WIP, cumulative production). */
export interface StockSummaryParams {
  /** Stock LEVELS as of the end of this day. Omit for right now. */
  asOfDate?: string;
  /** Flow figures (received, production, dispatched) for this period. Omit both for all-time. */
  startDate?: string;
  endDate?: string;
}

export async function getStockSummaryApi(p: StockSummaryParams = {}): Promise<StockSummaryOut> {
  const q = new URLSearchParams();
  if (p.asOfDate) q.set('as_of_date', p.asOfDate);
  if (p.startDate) q.set('start_date', p.startDate);
  if (p.endDate) q.set('end_date', p.endDate);
  const qs = q.toString();
  return apiFetch<StockSummaryOut>(`/admin/analytics/stock-summary${qs ? `?${qs}` : ''}`);
}

