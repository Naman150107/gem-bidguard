import { GovSource } from "../../lib/types";
import type { GovProvider, ProviderQuery, ProviderResult } from "./types";
import { lookupMock } from "./mock-store";

const LABEL = "Income Tax Department (PAN)";

/**
 * PAN provider. MOCK — reads seeded demo data; not a real integration.
 *
 * Real drop-in: call the authorized PAN verification API with `query.pan` and
 * map { name, status } into ProviderResult.payload.
 */
export const panProvider: GovProvider = {
  source: GovSource.PAN,
  label: LABEL,
  async verify(query: ProviderQuery): Promise<ProviderResult> {
    return lookupMock(GovSource.PAN, query, LABEL);
  },
};
