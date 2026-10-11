import type { ConeType } from './types';

const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

/** Weight of ONE cone. cone_types.net_weight_kg is per cone, not per package. */
export const coneKg = (c: ConeType): number => parseFloat(c.net_weight_kg) || 0;

/** Target weight of one full package: bundle_count x net_weight_kg (never net_weight_kg alone). */
export const bagKg = (c: ConeType): number => c.bundle_count * coneKg(c);

/** "24 cones · 2.1 kg each · 50.4 kg per bag" */
export function coneTypeLabel(c: ConeType): string {
  return `${c.bundle_count} cones · ${fmt(coneKg(c))} kg each · ${fmt(bagKg(c))} kg per bag`;
}

/** Short form for tight spaces: "24 cones · 50.4 kg bag" */
export function coneTypeShort(c: ConeType): string {
  return `${c.bundle_count} cones · ${fmt(bagKg(c))} kg bag`;
}
