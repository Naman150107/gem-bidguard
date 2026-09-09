import { GovSource } from "../../lib/types";
import type { GovProvider, ProviderQuery, ProviderResult } from "./types";
import { lookupMock } from "./mock-store";

const LABEL = "GeM Debarment / Blacklist Registry";

/**
 * Debarment / blacklist provider. MOCK — reads seeded demo data; not a real
 * integration.
 *
 * Real drop-in: query the GeM / CPPP debarment and blacklist registries by all
 * available identifiers (PAN, GSTIN, CIN, legal name) and map
 * { debarred, authority, reason, periodFrom, periodTo } into payload.
 *
 * Interpretation contract for the rules engine:
 *   - status VERIFIED + payload.debarred === true  → active debarment (CRITICAL)
 *   - status NOT_FOUND (or payload.debarred false)  → no debarment on record
 */
export const debarmentProvider: GovProvider = {
  source: GovSource.DEBARMENT,
  label: LABEL,
  async verify(query: ProviderQuery): Promise<ProviderResult> {
    return lookupMock(GovSource.DEBARMENT, query, LABEL);
  },
};
