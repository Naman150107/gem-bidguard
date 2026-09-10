import { DocumentType } from "../../lib/types";
import type { DocumentType as DocumentTypeT } from "../../lib/types";
import { extractGstin, extractPan, parseFields, pick } from "./parse";

/**
 * Shared deterministic per-document field extraction.
 *
 * Used in two places so upload-time previews and verification-time extraction
 * always agree:
 *   - POST /api/upload stores `extractedFields` + `extractionConfidence`.
 *   - the seeded extractor builds its ExtractedDocuments from the same logic.
 *
 * Handles both the seeded "Label: value" demo text AND real GST/PAN
 * certificate text (free-form layout) via regex fallbacks over the raw text.
 * Produces FACTS only — never a compliance verdict.
 */

export interface DocumentPreview {
  fields: Record<string, string>;
  pan?: string;
  gstin?: string;
  legalName?: string;
  address?: string;
  status?: string;
  issueDate?: string;
  expiryDate?: string;
  confidence: number;
}

const PLACEHOLDER_RE = /^\[(Binary|Unparseable|Empty)/i;

/** A stored placeholder (or blank) carries no usable facts. */
export function isPlaceholderContent(content: string): boolean {
  const t = (content ?? "").trim();
  return t.length === 0 || PLACEHOLDER_RE.test(t);
}

/**
 * Find a value for `labels` in free-form certificate text. First tries the
 * parsed "Label: value" map, then scans raw lines: a line containing the label
 * yields the text after `:`/`-`, or the next non-empty line when the value is
 * on the following line (common in GST certificates).
 */
function valueAfterLabel(
  content: string,
  fields: Record<string, string>,
  ...labels: string[]
): string | undefined {
  const fromFields = pick(fields, ...labels);
  if (fromFields) return fromFields;

  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const lowered = labels.map((l) => l.toLowerCase());
  for (let i = 0; i < lines.length; i++) {
    const low = lines[i].toLowerCase();
    const hit = lowered.find((l) => low.includes(l));
    if (!hit) continue;
    // Same-line value after a separator.
    const sep = lines[i].search(/[:\-–—]/);
    if (sep >= 0) {
      const rest = lines[i].slice(sep + 1).trim();
      if (rest.length >= 2 && !/^(no|n\/a|na|nil|none)$/i.test(rest)) {
        return rest.slice(0, 300);
      }
    }
    // Value on the next line (e.g. "Legal Name" followed by the name).
    const next = lines[i + 1]?.trim();
    if (
      next &&
      next.length >= 2 &&
      !lowered.some((l) => next.toLowerCase().includes(l)) &&
      next.length <= 300
    ) {
      return next;
    }
  }
  return undefined;
}

const NAME_LABELS = [
  "legal name",
  "trade name",
  "name of enterprise",
  "constitution",
  "name of taxpayer",
  "taxpayer name",
  "name",
];

/** GST certificates put the address under these headings. */
const ADDRESS_LABELS = [
  "principal place of business",
  "registered address",
  "place of business",
  "address of principal",
  "address",
];

function confidenceFor(
  type: DocumentTypeT,
  opts: {
    placeholder: boolean;
    fieldCount: number;
    hasPan: boolean;
    hasGstin: boolean;
    hasName: boolean;
    hasAddress: boolean;
    textLen: number;
  },
): number {
  if (opts.placeholder || opts.textLen === 0) return 0.2;
  // Seeded demo text is clean labelled text with identifiers — keep the
  // historical stable confidence so existing demo expectations hold.
  if (opts.fieldCount >= 3 && (opts.hasPan || opts.hasGstin)) return 0.98;

  if (type === DocumentType.GST_CERTIFICATE) {
    if (opts.hasGstin && (opts.hasName || opts.hasAddress)) return 0.9;
    if (opts.hasGstin) return 0.8;
    if (opts.hasPan || opts.hasName) return 0.6;
    return opts.textLen > 50 ? 0.45 : 0.35;
  }
  if (type === DocumentType.PAN_CARD) {
    if (opts.hasPan && opts.hasName) return 0.9;
    if (opts.hasPan) return 0.8;
    if (opts.hasName) return 0.6;
    return opts.textLen > 50 ? 0.45 : 0.35;
  }
  // Other document types: base confidence on how much was parsed.
  if (opts.fieldCount >= 2) return 0.85;
  if (opts.fieldCount === 1) return 0.75;
  return opts.textLen > 50 ? 0.6 : 0.35;
}

/** Deterministic best-effort extraction for one stored document. */
export function previewDocument(
  type: DocumentTypeT,
  content: string,
  opts?: { issueDate?: string | null; expiryDate?: string | null },
): DocumentPreview {
  if (isPlaceholderContent(content)) {
    return { fields: {}, confidence: 0.2 };
  }
  const fields = parseFields(content);
  const panText = pick(fields, "pan");
  const gstinText = pick(fields, "gstin");
  const pan = extractPan(panText) ?? extractPan(content);
  const gstin = extractGstin(gstinText) ?? extractGstin(content);
  const legalName = valueAfterLabel(content, fields, ...NAME_LABELS);
  const address = valueAfterLabel(content, fields, ...ADDRESS_LABELS);
  const status =
    pick(fields, "status", "registration status") ??
    valueAfterLabel(content, fields, "registration status", "status");
  const issueDate =
    opts?.issueDate ??
    pick(fields, "date of registration", "registration date", "issue date") ??
    undefined;
  const expiryDate =
    opts?.expiryDate ?? pick(fields, "valid upto", "validity") ?? undefined;

  const confidence = confidenceFor(type, {
    placeholder: false,
    fieldCount: Object.keys(fields).length,
    hasPan: Boolean(pan),
    hasGstin: Boolean(gstin),
    hasName: Boolean(legalName),
    hasAddress: Boolean(address),
    textLen: content.trim().length,
  });

  return {
    fields,
    pan,
    gstin,
    legalName,
    address,
    status,
    issueDate,
    expiryDate,
    confidence,
  };
}
