import type { GovSource as GovSourceT, ProviderStatus as ProviderStatusT } from "../../lib/types";

/**
 * Identifiers the platform may hand to a government provider. Real adapters use
 * the relevant field(s) for their API; the mock resolver tries them in order.
 *
 * `bidderKey` is a MOCK-ONLY convenience for the seeded dataset and is ignored
 * by any real integration.
 */
export interface ProviderQuery {
  bidderKey?: string;
  pan?: string | null;
  gstin?: string | null;
  udyamNumber?: string | null;
  cin?: string | null;
  legalName?: string | null;
  name?: string | null;
}

/** Normalized result returned by every provider (mock or real). */
export interface ProviderResult {
  source: GovSourceT;
  /** Human label for the authority, e.g. "GST Network (GSTN)". */
  label: string;
  status: ProviderStatusT;
  /** Model/lookup confidence, 0..1. */
  confidence: number;
  /** Raw authority payload (shape varies per source). */
  payload: Record<string, unknown>;
  /** True when produced by the mock layer rather than a real API. */
  isMock: boolean;
  /** ISO timestamp of the lookup. */
  checkedAt: string;
  note?: string;
}

/**
 * Contract every government source adapter implements. Swapping a mock for a
 * real integration means providing a new object with the same `source` and a
 * `verify()` that calls the authorized API and maps the response to
 * `ProviderResult` — nothing else in the pipeline changes.
 */
export interface GovProvider {
  readonly source: GovSourceT;
  readonly label: string;
  verify(query: ProviderQuery): Promise<ProviderResult>;
}
