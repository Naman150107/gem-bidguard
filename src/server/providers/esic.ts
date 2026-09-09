import { GovSource } from "../../lib/types";
import type { GovProvider, ProviderQuery, ProviderResult } from "./types";
import { lookupMock } from "./mock-store";

const LABEL = "Employees' State Insurance Corporation (ESIC)";

/**
 * ESIC provider. MOCK — reads seeded demo data; not a real integration.
 *
 * Real drop-in: query ESIC with the employer code / PAN and map
 * { esicCode, status } into payload.
 */
export const esicProvider: GovProvider = {
  source: GovSource.ESIC,
  label: LABEL,
  async verify(query: ProviderQuery): Promise<ProviderResult> {
    return lookupMock(GovSource.ESIC, query, LABEL);
  },
};
