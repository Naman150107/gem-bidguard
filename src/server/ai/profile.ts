import { DocumentType, Severity } from "../../lib/types";
import type { DocumentType as DocumentTypeT } from "../../lib/types";
import type {
  ExtractedDocument,
  ExtractedProfile,
  ExtractionFinding,
} from "./types";
import {
  extractGstin,
  extractPan,
  parseCrore,
  parseInr,
  parseIntSafe,
  parsePercent,
  parseYesNo,
  pick,
} from "./parse";

/**
 * Build an engine-ready profile from per-document extracted fields. This logic
 * is shared by the seeded and LLM extractors so both produce identical profile
 * shapes — the only difference between them is how `fields` were obtained.
 *
 * NOTE: This produces FACTS only. It draws no compliance conclusions; the
 * rules engine interprets these values.
 */
export function buildProfile(documents: ExtractedDocument[]): ExtractedProfile {
  const byType = new Map<DocumentTypeT, ExtractedDocument>();
  for (const d of documents) if (!byType.has(d.type)) byType.set(d.type, d);

  const gst = byType.get(DocumentType.GST_CERTIFICATE);
  const panCard = byType.get(DocumentType.PAN_CARD);
  const itr = byType.get(DocumentType.ITR);
  const oem = byType.get(DocumentType.OEM_AUTHORIZATION);
  const local = byType.get(DocumentType.LOCAL_CONTENT_DECLARATION);
  const decl = byType.get(DocumentType.BID_DECLARATION);

  // Declared identity: prefer the PAN card / GST certificate for canonical values.
  const declaredPan =
    panCard?.pan ?? gst?.pan ?? decl?.pan ?? undefined;
  const declaredGstin = gst?.gstin ?? decl?.gstin ?? undefined;
  const declaredName = panCard?.legalName ?? gst?.legalName ?? decl?.legalName;
  const declaredAddress = gst?.address ?? decl?.address;

  const avgAnnualTurnoverCr = parseCrore(
    pick(itr?.fields ?? {}, "average annual turnover", "average") ??
      pick(itr?.fields ?? {}, "turnover"),
  );

  const localContentPct = parsePercent(
    pick(local?.fields ?? {}, "local content"),
  );

  const similarOrders = parseIntSafe(
    pick(decl?.fields ?? {}, "similar supply orders", "similar"),
  );

  const emdPaidInr = parseInr(pick(decl?.fields ?? {}, "emd paid"));
  const emdExemptionClaimed = parseYesNo(
    pick(decl?.fields ?? {}, "emd exemption"),
  );

  const oemValidUpto = oem?.expiryDate ?? pick(oem?.fields ?? {}, "valid upto");
  const oemStatusText = oem?.status ?? pick(oem?.fields ?? {}, "status");

  const declaredDebarred = parseYesNo(
    pick(decl?.fields ?? {}, "blacklisted", "debarred"),
  );

  const confidence =
    documents.length > 0
      ? documents.reduce((s, d) => s + d.confidence, 0) / documents.length
      : 0;

  const findings = deriveFindings(documents, {
    avgAnnualTurnoverCr,
    localContentPct,
    similarOrders,
    emdPaidInr,
  });

  return {
    documents,
    findings,
    declaredPan,
    declaredGstin,
    declaredName,
    declaredAddress,
    avgAnnualTurnoverCr,
    localContentPct,
    similarOrders,
    emdPaidInr,
    emdExemptionClaimed,
    oemValidUpto,
    oemStatusText,
    declaredDebarred,
    confidence,
  };
}

/**
 * Surface descriptive, non-authoritative observations for officer context.
 * These do NOT decide compliance — they only flag what a reviewer should look
 * at. Emitted deterministically so the demo is stable offline.
 */
function deriveFindings(
  documents: ExtractedDocument[],
  facts: {
    avgAnnualTurnoverCr?: number;
    localContentPct?: number;
    similarOrders?: number;
    emdPaidInr?: number;
  },
): ExtractionFinding[] {
  const findings: ExtractionFinding[] = [];
  const push = (f: ExtractionFinding) => findings.push(f);

  // Extracted-value confidence notes (low fields).
  for (const d of documents) {
    if (d.confidence < 0.75) {
      push({
        code: `LOW_CONF_${d.type}`,
        severity: Severity.LOW,
        finding: `Extraction confidence for ${d.fileName} is ${(d.confidence * 100).toFixed(0)}%; officer should verify key fields manually.`,
        confidence: d.confidence,
        affectedDocument: d.fileName,
      });
    }
  }

  if (facts.emdPaidInr === 0) {
    push({
      code: "EMD_ZERO",
      severity: Severity.HIGH,
      finding:
        "Bid declaration reports EMD paid as INR 0. Verify EMD payment or a valid exemption.",
      confidence: 0.9,
    });
  }

  return findings;
}
