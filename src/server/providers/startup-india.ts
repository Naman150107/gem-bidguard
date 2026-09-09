import { GovSource } from "../../lib/types";
import type { GovProvider, ProviderQuery, ProviderResult } from "./types";
import { lookupMock } from "./mock-store";

const LABEL = "Startup India (DPIIT)";

/**
 * Startup India (DPIIT recognition) provider. MOCK — reads seeded demo data;
 * not a real integration.
 *
 * Real drop-in: query the DPIIT recognition API and map
 * { recognitionNumber, status } into payload. NOT_FOUND simply means the
 * bidder holds no DPIIT recognition (common and not itself a failure).
 */
export const startupIndiaProvider: GovProvider = {
  source: GovSource.STARTUP_INDIA,
  label: LABEL,
  async verify(query: ProviderQuery): Promise<ProviderResult> {
    return lookupMock(GovSource.STARTUP_INDIA, query, LABEL);
  },
};
