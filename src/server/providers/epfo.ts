import { GovSource } from "../../lib/types";
import type { GovProvider, ProviderQuery, ProviderResult } from "./types";
import { lookupMock } from "./mock-store";

const LABEL = "Employees' Provident Fund Organisation (EPFO)";

/**
 * EPFO provider. MOCK — reads seeded demo data; not a real integration.
 *
 * Real drop-in: query EPFO with the establishment code / PAN and map
 * { establishmentCode, status } into payload. Note that a found establishment
 * may still be non-compliant (e.g. "ACTIVE_WITH_ARREARS") — status is surfaced
 * verbatim for the rules engine to interpret.
 */
export const epfoProvider: GovProvider = {
  source: GovSource.EPFO,
  label: LABEL,
  async verify(query: ProviderQuery): Promise<ProviderResult> {
    return lookupMock(GovSource.EPFO, query, LABEL);
  },
};
