import { demoBidders, type GovRecord } from "../../data/demo";
import { ProviderStatus } from "../../lib/types";
import type { GovSource as GovSourceT } from "../../lib/types";
import type { ProviderQuery, ProviderResult } from "./types";

/**
 * Mock "government truth" store.
 *
 * IMPORTANT: This is seeded demo data, NOT a real government integration. It
 * simulates what an authorized authority API would return so the rest of the
 * pipeline (discrepancy detection, compliance rules, risk scoring) can be built
 * and demonstrated end-to-end. Every result it produces is flagged `isMock:true`.
 *
 * Each demo bidder's authored government records are indexed under all of that
 * bidder's identifiers (declared PAN/GSTIN/CIN/Udyam, plus name and demo key),
 * so a lookup by any declared identifier resolves to the same authority record —
 * mirroring how a real query-by-identifier would behave.
 */

type GovMap = Partial<Record<GovSourceT, GovRecord>>;

function normId(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

function normName(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

const index = new Map<string, GovMap>();

function register(key: string | undefined | null, gov: GovMap) {
  if (!key) return;
  const k = normId(key);
  if (!index.has(k)) index.set(k, gov);
}

for (const b of demoBidders) {
  const gov = b.government as GovMap;
  register(b.key, gov);
  register(b.pan, gov);
  register(b.gstin, gov);
  register(b.cin, gov);
  register(b.udyamNumber, gov);
  // Names use a looser normalization key namespace.
  index.set(`NAME:${normName(b.name)}`, gov);
  index.set(`NAME:${normName(b.legalName)}`, gov);
}

function resolve(query: ProviderQuery): GovMap | undefined {
  const candidates = [
    query.bidderKey,
    query.gstin,
    query.pan,
    query.cin,
    query.udyamNumber,
  ];
  for (const c of candidates) {
    if (c) {
      const hit = index.get(normId(c));
      if (hit) return hit;
    }
  }
  for (const n of [query.legalName, query.name]) {
    if (n) {
      const hit = index.get(`NAME:${normName(n)}`);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * Resolve a single source for the entity described by `query`. Returns the
 * authored record when present, or a NOT_FOUND result otherwise.
 */
export function lookupMock(
  source: GovSourceT,
  query: ProviderQuery,
  label: string,
): ProviderResult {
  const checkedAt = new Date().toISOString();
  const gov = resolve(query);
  const record = gov?.[source];

  if (!record) {
    return {
      source,
      label,
      status: ProviderStatus.NOT_FOUND,
      confidence: 0.95,
      payload: { found: false },
      isMock: true,
      checkedAt,
      note: `No ${label} record found for the supplied identifiers.`,
    };
  }

  return {
    source,
    label,
    status: record.status,
    confidence: record.confidence,
    payload: record.payload,
    isMock: true,
    checkedAt,
  };
}
