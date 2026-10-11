/** "GODOWN_MANAGER_RM" -> "Godown Manager RM" */
const ROLE_LABELS: Record<string, string> = {
  GATEMAN: 'Gateman',
  SUPERVISOR: 'Supervisor',
  GODOWN_MANAGER: 'Godown Manager',
  GODOWN_MANAGER_RM: 'RM Godown',
  GODOWN_MANAGER_PKG: 'PKG Godown',
  GM_MD_ADMIN: 'Admin',
};

export function formatRole(role: string): string {
  return (
    ROLE_LABELS[role] ??
    role
      .toLowerCase()
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  );
}

/** "12 min", "2 h 10 min", "3 d" — how long ago an ISO timestamp was. */
export function formatElapsed(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ${mins % 60} min`;
  return `${Math.floor(hours / 24)} d`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "11 Oct, 7:05 pm" in the device's local time. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const h = d.getHours();
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}, ${((h + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
