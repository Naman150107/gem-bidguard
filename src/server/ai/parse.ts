/**
 * Deterministic parsing helpers shared by the seeded extractor and used to
 * post-process LLM output. These operate on the labeled "Label: value" document
 * text used throughout the demo dataset and by typical OCR of Indian compliance
 * certificates.
 */

/** Parse "Label: value" lines into a lowercase-keyed map. */
export function parseFields(content: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const idx = rawLine.indexOf(":");
    if (idx <= 0) continue;
    const key = rawLine.slice(0, idx).trim().toLowerCase();
    const value = rawLine.slice(idx + 1).trim();
    if (key && value) fields[key] = value;
  }
  return fields;
}

/** First field whose key contains any of the given substrings. */
export function pick(
  fields: Record<string, string>,
  ...keyParts: string[]
): string | undefined {
  for (const [k, v] of Object.entries(fields)) {
    if (keyParts.some((p) => k.includes(p))) return v;
  }
  return undefined;
}

const PAN_RE = /[A-Z]{5}[0-9]{4}[A-Z]/;
const GSTIN_RE = /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}/;

export function extractPan(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = text.toUpperCase().match(PAN_RE);
  return m?.[0];
}

export function extractGstin(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = text.toUpperCase().match(GSTIN_RE);
  return m?.[0];
}

/**
 * Parse an INR amount in crores from strings like:
 *   "INR 8.20 Crore", "8.2 Cr", "INR 9,00,000"
 * Returns a value expressed in crore (1 crore = 10,000,000).
 */
export function parseCrore(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const cleaned = text.replace(/,/g, " ");
  const croreMatch = cleaned.match(/([0-9]+(?:\.[0-9]+)?)\s*(crore|cr)\b/i);
  if (croreMatch) return parseFloat(croreMatch[1]);
  const rupeeMatch = cleaned.match(/(?:inr|rs\.?|₹)\s*([0-9][0-9\s]*)/i);
  if (rupeeMatch) {
    const rupees = parseFloat(rupeeMatch[1].replace(/\s/g, ""));
    if (!Number.isNaN(rupees)) return rupees / 1e7;
  }
  return undefined;
}

/** Parse a plain INR amount (rupees), tolerant of Indian digit grouping. */
export function parseInr(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const m = text.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return Number.isNaN(n) ? undefined : n;
}

export function parsePercent(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const m = text.match(/([0-9]+(?:\.[0-9]+)?)\s*%?/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return Number.isNaN(n) ? undefined : n;
}

export function parseIntSafe(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const m = text.match(/-?[0-9]+/);
  if (!m) return undefined;
  const n = parseInt(m[0], 10);
  return Number.isNaN(n) ? undefined : n;
}

/** Interpret a yes/no style declaration. Returns true for affirmative. */
export function parseYesNo(text: string | undefined): boolean | undefined {
  if (!text) return undefined;
  const t = text.trim().toLowerCase();
  if (/^(yes|y|true|debarred)/.test(t)) return true;
  if (/^(no|n|false|not)/.test(t)) return false;
  return undefined;
}
