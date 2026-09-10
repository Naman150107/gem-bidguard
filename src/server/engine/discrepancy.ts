import { DiscrepancyKind, Severity, GovSource } from "../../lib/types";
import type { Discrepancy, VerificationInput } from "./types";

/**
 * Cross-source consistency checks. Compares bidder-declared identity (from
 * extracted documents) against authoritative government records, and checks
 * internal declaration consistency.
 *
 * Pure and deterministic — no AI. Findings feed both the CONSISTENCY rules and
 * the officer-facing discrepancy list.
 */

function normId(v?: string | null): string {
  return (v ?? "").replace(/\s+/g, "").toUpperCase();
}
function normName(v?: string | null): string {
  return (v ?? "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}
function normAddr(v?: string | null): string {
  return (v ?? "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(estate|area|industrial|floor|survey|plot|office|no)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectDiscrepancies(input: VerificationInput): Discrepancy[] {
  const out: Discrepancy[] = [];
  const { profile, providers } = input;

  const gst = providers[GovSource.GST];
  const pan = providers[GovSource.PAN];
  const mca = providers[GovSource.MCA];

  const govPan = normId((gst?.payload?.pan as string) ?? (pan?.payload?.pan as string));
  const govGstin = normId(gst?.payload?.gstin as string);
  const govName = normName(
    (gst?.payload?.legalName as string) ??
      (mca?.payload?.companyName as string) ??
      (pan?.payload?.name as string),
  );
  const govAddr = gst?.payload?.address as string | undefined;

  const declPan = normId(profile.declaredPan);
  const declGstin = normId(profile.declaredGstin);
  const declName = normName(profile.declaredName ?? input.bidder.legalName);
  const declAddr = profile.declaredAddress ?? input.bidder.address;

  // PAN consistency (declared vs government, and vs GSTIN-embedded PAN).
  const gstinEmbeddedPan = declGstin.length >= 12 ? declGstin.slice(2, 12) : "";
  if (declPan && govPan && declPan !== govPan) {
    out.push({
      kind: DiscrepancyKind.PAN_MISMATCH,
      severity: Severity.HIGH,
      description: `Declared PAN (${profile.declaredPan}) does not match the PAN on government record (${govPan}).`,
      sources: ["Bidder documents", gst ? "GST" : "PAN"],
    });
  } else if (
    declPan &&
    gstinEmbeddedPan &&
    declPan !== gstinEmbeddedPan
  ) {
    out.push({
      kind: DiscrepancyKind.PAN_MISMATCH,
      severity: Severity.HIGH,
      description: `Declared PAN (${profile.declaredPan}) is inconsistent with the PAN embedded in the declared GSTIN (${gstinEmbeddedPan}).`,
      sources: ["PAN card", "GST certificate"],
    });
  }

  // GSTIN consistency (declared vs government record).
  if (declGstin && govGstin && declGstin !== govGstin) {
    out.push({
      kind: DiscrepancyKind.GSTIN_MISMATCH,
      severity: Severity.MEDIUM,
      description: `Declared GSTIN (${profile.declaredGstin}) does not match the government GSTIN (${govGstin}).`,
      sources: ["Bidder documents", "GST"],
    });
  }

  // GSTIN internal consistency: bid declaration GSTIN vs GST certificate GSTIN.
  const declDoc = profile.documents.find((d) => d.type === "BID_DECLARATION");
  const gstDoc = profile.documents.find((d) => d.type === "GST_CERTIFICATE");
  const declDocGstin = normId(declDoc?.fields?.["gstin"]);
  const gstDocGstin = normId(gstDoc?.gstin ?? gstDoc?.fields?.["gstin"]);
  if (declDocGstin && gstDocGstin && declDocGstin !== gstDocGstin) {
    out.push({
      kind: DiscrepancyKind.GSTIN_MISMATCH,
      severity: Severity.MEDIUM,
      description: `GSTIN on the bid declaration (${declDoc?.fields?.["gstin"]}) differs from the GST certificate (${gstDoc?.gstin ?? gstDoc?.fields?.["gstin"]}).`,
      sources: ["Bid declaration", "GST certificate"],
    });
  }

  // Legal-name consistency (declared vs government).
  if (declName && govName && declName !== govName) {
    out.push({
      kind: DiscrepancyKind.NAME_MISMATCH,
      severity: Severity.HIGH,
      description: `Declared legal name ("${profile.declaredName ?? input.bidder.legalName}") does not match government records ("${(gst?.payload?.legalName as string) ?? (mca?.payload?.companyName as string)}").`,
      sources: ["Bidder documents", gst ? "GST" : "MCA"],
    });
  }

  // Address consistency (declared vs government) — looser match.
  if (govAddr && declAddr && normAddr(declAddr) !== normAddr(govAddr)) {
    out.push({
      kind: DiscrepancyKind.ADDRESS_MISMATCH,
      severity: Severity.LOW,
      description: `Declared address differs from the address on government record. Declared: "${declAddr}"; Government: "${govAddr}".`,
      sources: ["Bidder documents", "GST"],
    });
  }

  // Conflicting debarment declaration: declared "not debarred" but registry says debarred.
  const deb = providers[GovSource.DEBARMENT];
  const govDebarred = deb?.status === "VERIFIED" && deb?.payload?.debarred === true;
  if (govDebarred && profile.declaredDebarred === false) {
    out.push({
      kind: DiscrepancyKind.CONFLICTING_DECLARATION,
      severity: Severity.CRITICAL,
      description: `Bidder self-declared as NOT debarred, but the debarment registry shows an active debarment${deb?.payload?.authority ? ` by ${deb.payload.authority}` : ""}.`,
      sources: ["Bid declaration", "Debarment registry"],
    });
  }

  // GST registration not active.
  const gstStatus = String(gst?.payload?.registrationStatus ?? "").toLowerCase();
  if (gstStatus && gstStatus !== "active") {
    out.push({
      kind: DiscrepancyKind.CONFLICTING_DECLARATION,
      severity: Severity.HIGH,
      description: `GST registration status on government record is "${gst?.payload?.registrationStatus}", not Active.`,
      sources: ["GST"],
    });
  }

  // Conflicting identity facts BETWEEN the bidder's own documents. The
  // profile's declared values only carry the first document per type, so
  // without this check a conflicting upload (e.g. a second GST certificate
  // with a different GSTIN) would be silently ignored. PAN/GSTIN are strict
  // identifiers, so any two documents disagreeing on them is flagged;
  // legal names are compared only within the same document type, where
  // trade-name-vs-legal-name variation cannot explain a difference.
  out.push(...detectInterDocumentConflicts(profile.documents));

  return out;
}

type ProfileDocument = VerificationInput["profile"]["documents"][number];

/** Short human label for a document source, e.g. `GST certificate "f.pdf"`. */
function docLabel(d: ProfileDocument): string {
  const kind =
    d.type === "GST_CERTIFICATE"
      ? "GST certificate"
      : d.type === "PAN_CARD"
        ? "PAN card"
        : d.type === "BID_DECLARATION"
          ? "Bid declaration"
          : d.type;
  return `${kind} "${d.fileName}"`;
}

/**
 * Flag identity conflicts between the bidder's own documents. Pure and
 * deterministic: documents are compared in fileName order and at most one
 * discrepancy per field is emitted, so output is stable for the same inputs.
 */
function detectInterDocumentConflicts(docs: ProfileDocument[]): Discrepancy[] {
  const out: Discrepancy[] = [];
  const ordered = [...docs].sort((a, b) => a.fileName.localeCompare(b.fileName));

  /** First pair of documents whose normalized values for `get` differ. */
  const firstConflict = (
    list: ProfileDocument[],
    get: (d: ProfileDocument) => string,
  ): [ProfileDocument, ProfileDocument] | null => {
    const holders = list.filter((d) => get(d));
    for (let i = 0; i < holders.length; i++) {
      for (let j = i + 1; j < holders.length; j++) {
        if (get(holders[i]) !== get(holders[j])) return [holders[i], holders[j]];
      }
    }
    return null;
  };

  const panConflict = firstConflict(ordered, (d) => normId(d.pan));
  if (panConflict) {
    const [a, b] = panConflict;
    out.push({
      kind: DiscrepancyKind.PAN_MISMATCH,
      severity: Severity.HIGH,
      description: `PAN differs between uploaded documents: "${a.pan}" (${docLabel(a)}) vs "${b.pan}" (${docLabel(b)}). Officer should determine which document is authoritative.`,
      sources: [docLabel(a), docLabel(b)],
    });
  }

  const gstinConflict = firstConflict(ordered, (d) => normId(d.gstin));
  if (gstinConflict) {
    const [a, b] = gstinConflict;
    out.push({
      kind: DiscrepancyKind.GSTIN_MISMATCH,
      severity: Severity.MEDIUM,
      description: `GSTIN differs between uploaded documents: "${a.gstin}" (${docLabel(a)}) vs "${b.gstin}" (${docLabel(b)}). Officer should determine which document is authoritative.`,
      sources: [docLabel(a), docLabel(b)],
    });
  }

  const byType = new Map<string, ProfileDocument[]>();
  for (const d of ordered) {
    const list = byType.get(d.type) ?? [];
    list.push(d);
    byType.set(d.type, list);
  }
  for (const [, group] of byType) {
    const nameConflict = firstConflict(group, (d) => normName(d.legalName));
    if (nameConflict) {
      const [a, b] = nameConflict;
      out.push({
        kind: DiscrepancyKind.NAME_MISMATCH,
        severity: Severity.HIGH,
        description: `Legal name differs between ${docLabel(a)} ("${a.legalName}") and ${docLabel(b)} ("${b.legalName}"). Officer should determine which document is authoritative.`,
        sources: [docLabel(a), docLabel(b)],
      });
    }
  }

  return out;
}
