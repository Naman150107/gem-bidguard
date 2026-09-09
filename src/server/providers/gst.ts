import { GovSource } from "../../lib/types";
import type { GovProvider, ProviderQuery, ProviderResult } from "./types";
import { lookupMock } from "./mock-store";

const LABEL = "GST Network (GSTN)";

/**
 * GST provider. MOCK — reads seeded demo data; not a real integration.
 *
 * Real drop-in: authenticate to the GST taxpayer API, query with
 * `query.gstin`, and map { legalName, pan, registrationStatus, address } into
 * ProviderResult.payload. Keep `isMock: false` for the real path.
 */
export const gstProvider: GovProvider = {
  source: GovSource.GST,
  label: LABEL,
  async verify(query: ProviderQuery): Promise<ProviderResult> {
    return lookupMock(GovSource.GST, query, LABEL);
  },
};
