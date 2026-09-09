import { GovSource } from "../../lib/types";
import type { GovSource as GovSourceT } from "../../lib/types";
import type { GovProvider, ProviderQuery, ProviderResult } from "./types";
import { gstProvider } from "./gst";
import { panProvider } from "./pan";
import { udyamProvider } from "./udyam";
import { mcaProvider } from "./mca";
import { epfoProvider } from "./epfo";
import { esicProvider } from "./esic";
import { startupIndiaProvider } from "./startup-india";
import { nsicProvider } from "./nsic";
import { debarmentProvider } from "./blacklist";

/**
 * Central registry of government source adapters. The pipeline talks only to
 * this registry, so a mock adapter can be swapped for a real one in one place.
 */
const PROVIDERS: GovProvider[] = [
  gstProvider,
  panProvider,
  udyamProvider,
  mcaProvider,
  epfoProvider,
  esicProvider,
  startupIndiaProvider,
  nsicProvider,
  debarmentProvider,
];

const BY_SOURCE = new Map<GovSourceT, GovProvider>(
  PROVIDERS.map((p) => [p.source, p]),
);

export function getProvider(source: GovSourceT): GovProvider | undefined {
  return BY_SOURCE.get(source);
}

export function allProviders(): GovProvider[] {
  return PROVIDERS;
}

/** Which sources exist in the registry (stable order). */
export const REGISTERED_SOURCES: GovSourceT[] = PROVIDERS.map((p) => p.source);

/**
 * Run every registered provider for one entity and return all results.
 * Providers are independent, so they run concurrently.
 */
export async function runAllProviders(
  query: ProviderQuery,
): Promise<ProviderResult[]> {
  return Promise.all(PROVIDERS.map((p) => p.verify(query)));
}

/** Convenience: index results by source. */
export function indexResults(
  results: ProviderResult[],
): Record<GovSourceT, ProviderResult | undefined> {
  const out = {} as Record<GovSourceT, ProviderResult | undefined>;
  for (const r of results) out[r.source] = r;
  return out;
}

export { GovSource };
export type { GovProvider, ProviderQuery, ProviderResult };
