import { GovSource } from "../../lib/types";
import type { GovProvider, ProviderQuery, ProviderResult } from "./types";
import { lookupMock } from "./mock-store";

const LABEL = "Ministry of Corporate Affairs (MCA21)";

/**
 * MCA provider. MOCK — reads seeded demo data; not a real integration.
 *
 * Real drop-in: query MCA21 with `query.cin` and map
 * { companyName, status } into payload.
 */
export const mcaProvider: GovProvider = {
  source: GovSource.MCA,
  label: LABEL,
  async verify(query: ProviderQuery): Promise<ProviderResult> {
    return lookupMock(GovSource.MCA, query, LABEL);
  },
};
