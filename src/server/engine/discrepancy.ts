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

  return out;
}
