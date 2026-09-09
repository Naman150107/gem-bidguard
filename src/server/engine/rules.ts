import {
  ComplianceResult,
  DiscrepancyKind,
  GovSource,
  ProviderStatus,
} from "../../lib/types";
import type { ComplianceResult as ComplianceResultT } from "../../lib/types";
import type {
  Discrepancy,
  EngineRule,
  RuleResult,
  VerificationInput,
} from "./types";

/**
 * Deterministic compliance engine.
 *
 * Each rule code maps to a pure handler that inspects the extracted profile and
 * government provider results and returns PASS / FAIL / WARNING / PENDING /
 * UNVERIFIED. This is the ONLY place a compliance outcome is decided — never the
 * AI. Handlers read thresholds from `rule.config` so they stay tunable.
 */

type Ctx = {
  input: VerificationInput;
  rule: EngineRule;
  discrepancies: Discrepancy[];
  num: (key: string, fallback: number) => number;
};

function R(
  result: ComplianceResultT,
  detail: string,
  evidence?: Record<string, unknown>,
): { result: ComplianceResultT; detail: string; evidence?: Record<string, unknown> } {
  return { result, detail, evidence };
}

type Handler = (ctx: Ctx) => {
  result: ComplianceResultT;
  detail: string;
  evidence?: Record<string, unknown>;
};

const providerVerified = (input: VerificationInput, source: string) =>
  input.providers[source]?.status === ProviderStatus.VERIFIED;

function daysUntil(dateStr?: string): number | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return undefined;
  const now = new Date();
  return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function hasDiscrepancy(discrepancies: Discrepancy[], kind: string): Discrepancy | undefined {
  return discrepancies.find((d) => d.kind === kind);
}

const HANDLERS: Record<string, Handler> = {
  // --- Mandatory tender requirements ---------------------------------------
  "RULE-EMD": ({ input }) => {
    const emd = input.profile.emdPaidInr;
    const exempt = input.profile.emdExemptionClaimed;
    if (emd === undefined) return R(ComplianceResult.PENDING, "EMD payment could not be determined from documents.");
    if (emd > 0) return R(ComplianceResult.PASS, `EMD of INR ${emd.toLocaleString("en-IN")} recorded.`, { emd });
    if (exempt) return R(ComplianceResult.WARNING, "EMD not paid but exemption claimed — verify eligibility.", { emd, exempt });
    return R(ComplianceResult.FAIL, "EMD not paid and no valid exemption claimed.", { emd });
  },

  "RULE-TURNOVER": ({ input, num }) => {
    const min = num("minTurnoverCr", 3);
    const t = input.profile.avgAnnualTurnoverCr;
    if (t === undefined) return R(ComplianceResult.PENDING, "Average annual turnover not found.");
    if (t >= min) return R(ComplianceResult.PASS, `Average annual turnover INR ${t} Cr meets the minimum of INR ${min} Cr.`, { turnoverCr: t, min });
    return R(ComplianceResult.FAIL, `Average annual turnover INR ${t} Cr is below the minimum of INR ${min} Cr.`, { turnoverCr: t, min });
  },

  "RULE-OEM": ({ input, num }) => {
    const warnWithin = num("warnWithinDays", 60);
    const upto = input.profile.oemValidUpto;
    const days = daysUntil(upto);
    if (days === undefined) return R(ComplianceResult.PENDING, "OEM authorization validity date not found.");
    if (days < 0) return R(ComplianceResult.FAIL, `OEM authorization expired on ${upto}.`, { upto, days });
    if (days <= warnWithin) return R(ComplianceResult.WARNING, `OEM authorization expires in ${days} day(s) (on ${upto}).`, { upto, days });
    return R(ComplianceResult.PASS, `OEM authorization valid until ${upto}.`, { upto, days });
  },

  "RULE-EXP": ({ input, num }) => {
    const minOrders = num("minOrders", 2);
    const warnAt = num("warnAt", 1);
    const orders = input.profile.similarOrders;
    if (orders === undefined) return R(ComplianceResult.PENDING, "Similar supply orders not found.");
    if (orders >= minOrders) return R(ComplianceResult.PASS, `${orders} similar supply order(s) meet the minimum of ${minOrders}.`, { orders, minOrders });
    if (orders >= warnAt) return R(ComplianceResult.WARNING, `${orders} similar supply order(s); minimum preferred is ${minOrders}.`, { orders, minOrders });
    return R(ComplianceResult.FAIL, `${orders} similar supply order(s); below the minimum of ${minOrders}.`, { orders, minOrders });
  },

  "RULE-LOCAL-CONTENT": ({ input, num }) => {
    const min = num("minPct", 50);
    const pctVal = input.profile.localContentPct ?? input.bidder.declaredLocalContentPct ?? undefined;
    if (pctVal === undefined) return R(ComplianceResult.PENDING, "Local content percentage not found.");
    if (pctVal >= min) return R(ComplianceResult.PASS, `Local content ${pctVal}% meets the minimum of ${min}%.`, { pct: pctVal, min });
    return R(ComplianceResult.FAIL, `Local content ${pctVal}% is below the minimum of ${min}%.`, { pct: pctVal, min });
  },

  // --- Statutory -----------------------------------------------------------
  "RULE-GST": ({ input }) => {
    const p = input.providers[GovSource.GST];
    if (!p || p.status === ProviderStatus.NOT_FOUND) return R(ComplianceResult.FAIL, "GST registration not found on government record.");
    const status = String(p.payload?.registrationStatus ?? "").toLowerCase();
    if (p.status === ProviderStatus.VERIFIED && status === "active") return R(ComplianceResult.PASS, "GST registration verified and Active.", { status: p.payload?.registrationStatus });
    if (status && status !== "active") return R(ComplianceResult.FAIL, `GST registration status is "${p.payload?.registrationStatus}".`, { status: p.payload?.registrationStatus });
    return R(ComplianceResult.WARNING, "GST registration found but status is unclear.", { status: p.payload?.registrationStatus });
  },

  "RULE-PAN": ({ input }) => {
    const p = input.providers[GovSource.PAN];
    if (!p || p.status === ProviderStatus.NOT_FOUND) return R(ComplianceResult.FAIL, "PAN not found on government record.");
    if (p.status === ProviderStatus.VERIFIED) return R(ComplianceResult.PASS, "PAN verified with the Income Tax Department.", { pan: p.payload?.pan });
    return R(ComplianceResult.WARNING, "PAN record inconclusive.");
  },

  "RULE-EPFO": ({ input }) => {
    const p = input.providers[GovSource.EPFO];
    if (!p || p.status === ProviderStatus.NOT_FOUND) return R(ComplianceResult.FAIL, "EPFO registration not found.");
    const status = String(p.payload?.status ?? "").toUpperCase();
    if (status.includes("ARREAR")) return R(ComplianceResult.WARNING, "EPFO registration active but contribution arrears reported.", { status: p.payload?.status });
    if (status === "ACTIVE") return R(ComplianceResult.PASS, "EPFO registration active.", { status: p.payload?.status });
    return R(ComplianceResult.WARNING, `EPFO status is "${p.payload?.status}".`, { status: p.payload?.status });
  },

  "RULE-ESIC": ({ input }) => {
    const p = input.providers[GovSource.ESIC];
    if (!p || p.status === ProviderStatus.NOT_FOUND) return R(ComplianceResult.FAIL, "ESIC registration not found.");
    const status = String(p.payload?.status ?? "").toUpperCase();
    if (status === "ACTIVE") return R(ComplianceResult.PASS, "ESIC registration active.", { status: p.payload?.status });
    return R(ComplianceResult.WARNING, `ESIC status is "${p.payload?.status}".`, { status: p.payload?.status });
  },

  "RULE-BLACKLIST": ({ input }) => {
    const p = input.providers[GovSource.DEBARMENT];
    if (p && p.status === ProviderStatus.VERIFIED && p.payload?.debarred === true) {
      const auth = p.payload?.authority ? ` by ${p.payload.authority}` : "";
      const period = p.payload?.periodTo ? ` (until ${p.payload.periodTo})` : "";
      return R(ComplianceResult.FAIL, `Active debarment on record${auth}${period}.`, {
        authority: p.payload?.authority,
        reason: p.payload?.reason,
        periodFrom: p.payload?.periodFrom,
        periodTo: p.payload?.periodTo,
      });
    }
    return R(ComplianceResult.PASS, "No debarment or blacklisting found.");
  },

  // --- Document validity ---------------------------------------------------
  "RULE-DOC-COMPLETENESS": ({ input, rule }) => {
    const required = ((rule.config?.requiredDocs as string[]) ?? []).map(String);
    const present = new Set(input.presentDocumentTypes);
    const missing = required.filter((d) => !present.has(d));
    if (missing.length === 0) return R(ComplianceResult.PASS, "All required documents submitted.", { required });
    const severityRatio = missing.length / Math.max(required.length, 1);
    const result = severityRatio > 0.25 ? ComplianceResult.FAIL : ComplianceResult.WARNING;
    return R(result, `Missing required document(s): ${missing.join(", ")}.`, { missing });
  },

  "RULE-DOC-VALIDITY": ({ input, num }) => {
    const warnWithin = num("warnWithinDays", 30);
    const expired: string[] = [];
    const expiring: string[] = [];
    for (const d of input.profile.documents) {
      const days = daysUntil(d.expiryDate ?? undefined);
      if (days === undefined) continue;
      if (days < 0) expired.push(`${d.fileName} (${d.expiryDate})`);
      else if (days <= warnWithin) expiring.push(`${d.fileName} (${d.expiryDate})`);
    }
    if (expired.length > 0) return R(ComplianceResult.FAIL, `Expired document(s): ${expired.join(", ")}.`, { expired, expiring });
    if (expiring.length > 0) return R(ComplianceResult.WARNING, `Document(s) expiring soon: ${expiring.join(", ")}.`, { expiring });
    return R(ComplianceResult.PASS, "No expired or soon-to-expire documents.");
  },

  // --- Cross-source consistency --------------------------------------------
  "RULE-PAN-CONSISTENCY": ({ discrepancies }) => {
    const d = hasDiscrepancy(discrepancies, DiscrepancyKind.PAN_MISMATCH);
    return d ? R(ComplianceResult.FAIL, d.description, { kind: d.kind }) : R(ComplianceResult.PASS, "PAN consistent across documents and government records.");
  },

  "RULE-GSTIN-CONSISTENCY": ({ discrepancies }) => {
    const d = hasDiscrepancy(discrepancies, DiscrepancyKind.GSTIN_MISMATCH);
    return d ? R(ComplianceResult.WARNING, d.description, { kind: d.kind }) : R(ComplianceResult.PASS, "GSTIN consistent across sources.");
  },

  "RULE-NAME-CONSISTENCY": ({ discrepancies }) => {
    const d = hasDiscrepancy(discrepancies, DiscrepancyKind.NAME_MISMATCH);
    return d ? R(ComplianceResult.FAIL, d.description, { kind: d.kind }) : R(ComplianceResult.PASS, "Legal name consistent across sources.");
  },

  "RULE-ADDRESS-CONSISTENCY": ({ discrepancies }) => {
    const d = hasDiscrepancy(discrepancies, DiscrepancyKind.ADDRESS_MISMATCH);
    return d ? R(ComplianceResult.WARNING, d.description, { kind: d.kind }) : R(ComplianceResult.PASS, "Address consistent across sources.");
  },
};

/** Fallback for rule codes without a specific handler. */
function defaultHandler(): { result: ComplianceResultT; detail: string } {
  return R(ComplianceResult.PENDING, "No handler configured for this rule; requires manual review.");
}

export function evaluateRules(
  input: VerificationInput,
  discrepancies: Discrepancy[],
): RuleResult[] {
  return input.rules.map((rule) => {
    const num = (key: string, fallback: number) => {
      const v = rule.config?.[key];
      return typeof v === "number" ? v : fallback;
    };
    const handler = HANDLERS[rule.code] ?? defaultHandler;
    const { result, detail, evidence } = handler({ input, rule, discrepancies, num });
    return {
      code: rule.code,
      title: rule.title,
      weightCategory: rule.weightCategory,
      severityOnFail: rule.severityOnFail,
      result,
      detail,
      evidence,
    };
  });
}
