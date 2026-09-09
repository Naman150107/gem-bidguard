import { GovSource } from "../../lib/types";
import type { GovProvider, ProviderQuery, ProviderResult } from "./types";
import { lookupMock } from "./mock-store";

const LABEL = "Udyam / MSME Registration";

/**
 * Udyam (MSME) provider. MOCK — reads seeded demo data; not a real integration.
 *
 * Real drop-in: query the Udyam Registration portal API with
 * `query.udyamNumber` (or PAN) and map { enterpriseType, status } into payload.
 */
export const udyamProvider: GovProvider = {
  source: GovSource.UDYAM,
  label: LABEL,
  async verify(query: ProviderQuery): Promise<ProviderResult> {
    return lookupMock(GovSource.UDYAM, query, LABEL);
  },
};
