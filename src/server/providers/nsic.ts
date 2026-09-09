import { GovSource } from "../../lib/types";
import type { GovProvider, ProviderQuery, ProviderResult } from "./types";
import { lookupMock } from "./mock-store";

const LABEL = "National Small Industries Corporation (NSIC)";

/**
 * NSIC registration provider. MOCK — reads seeded demo data; not a real
 * integration.
 *
 * Real drop-in: query the NSIC single-point registration API and map
 * { registrationNumber, monetaryLimit, status } into payload. NOT_FOUND means
 * the bidder holds no NSIC registration.
 */
export const nsicProvider: GovProvider = {
  source: GovSource.NSIC,
  label: LABEL,
  async verify(query: ProviderQuery): Promise<ProviderResult> {
    return lookupMock(GovSource.NSIC, query, LABEL);
  },
};
