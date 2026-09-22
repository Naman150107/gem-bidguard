/**
 * Shared domain types for VendorPulse AI.
 *
 * Enums are modelled as `const` objects + string-literal unions (instead of TS
 * `enum`) so they:
 *   - stay in sync with the `String` fields in the Prisma schema,
 *   - serialize cleanly to JSON, and
 *   - can be executed by Node's type-stripping loader for offline engine tests.
 */

// --- Compliance evaluation --------------------------------------------------

export const ComplianceResult = {
  PASS: "PASS",
  FAIL: "FAIL",
  WARNING: "WARNING",
  PENDING: "PENDING",
  UNVERIFIED: "UNVERIFIED",
  NOT_APPLICABLE: "NOT_APPLICABLE",
} as const;
export type ComplianceResult =
  (typeof ComplianceResult)[keyof typeof ComplianceResult];

// --- Risk -------------------------------------------------------------------

export const RiskLevel = {
  LOW: "LOW",
  MODERATE: "MODERATE",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const Severity = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
  INFO: "INFO",
} as const;
export type Severity = (typeof Severity)[keyof typeof Severity];

// --- Rules ------------------------------------------------------------------

export const WeightCategory = {
  MANDATORY: "MANDATORY",
  STATUTORY: "STATUTORY",
  DOCUMENT: "DOCUMENT",
  CONSISTENCY: "CONSISTENCY",
} as const;
export type WeightCategory =
  (typeof WeightCategory)[keyof typeof WeightCategory];

export const RuleScope = {
  STATUTORY: "STATUTORY",
  TENDER: "TENDER",
  DOCUMENT: "DOCUMENT",
  CONSISTENCY: "CONSISTENCY",
} as const;
export type RuleScope = (typeof RuleScope)[keyof typeof RuleScope];

// --- Documents --------------------------------------------------------------

export const DocumentType = {
  GST_CERTIFICATE: "GST_CERTIFICATE",
  PAN_CARD: "PAN_CARD",
  UDYAM_CERTIFICATE: "UDYAM_CERTIFICATE",
  ITR: "ITR",
  OEM_AUTHORIZATION: "OEM_AUTHORIZATION",
  LOCAL_CONTENT_DECLARATION: "LOCAL_CONTENT_DECLARATION",
  EPFO: "EPFO",
  ESIC: "ESIC",
  STARTUP_CERT: "STARTUP_CERT",
  NSIC_CERT: "NSIC_CERT",
  BID_DECLARATION: "BID_DECLARATION",
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

// --- Government sources -----------------------------------------------------

export const GovSource = {
  GST: "GST",
  PAN: "PAN",
  UDYAM: "UDYAM",
  MCA: "MCA",
  EPFO: "EPFO",
  ESIC: "ESIC",
  STARTUP_INDIA: "STARTUP_INDIA",
  NSIC: "NSIC",
  DEBARMENT: "DEBARMENT",
} as const;
export type GovSource = (typeof GovSource)[keyof typeof GovSource];

export const ProviderStatus = {
  VERIFIED: "VERIFIED",
  NOT_FOUND: "NOT_FOUND",
  MISMATCH: "MISMATCH",
  UNVERIFIED: "UNVERIFIED",
  ERROR: "ERROR",
} as const;
export type ProviderStatus =
  (typeof ProviderStatus)[keyof typeof ProviderStatus];

// --- Discrepancies ----------------------------------------------------------

export const DiscrepancyKind = {
  PAN_MISMATCH: "PAN_MISMATCH",
  GSTIN_MISMATCH: "GSTIN_MISMATCH",
  NAME_MISMATCH: "NAME_MISMATCH",
  ADDRESS_MISMATCH: "ADDRESS_MISMATCH",
  DATE_INCONSISTENCY: "DATE_INCONSISTENCY",
  EXPIRED_DOCUMENT: "EXPIRED_DOCUMENT",
  MISSING_DOCUMENT: "MISSING_DOCUMENT",
  CONFLICTING_DECLARATION: "CONFLICTING_DECLARATION",
  UNVERIFIED_SOURCE: "UNVERIFIED_SOURCE",
} as const;
export type DiscrepancyKind =
  (typeof DiscrepancyKind)[keyof typeof DiscrepancyKind];

// --- Run & decision ---------------------------------------------------------

export const RunStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export type RunStatus = (typeof RunStatus)[keyof typeof RunStatus];

export const DecisionStatus = {
  PENDING: "PENDING",
  QUALIFIED: "QUALIFIED",
  REJECTED: "REJECTED",
} as const;
export type DecisionStatus =
  (typeof DecisionStatus)[keyof typeof DecisionStatus];

export const AuditAction = {
  VERIFICATION_STARTED: "VERIFICATION_STARTED",
  DOCUMENT_EXTRACTED: "DOCUMENT_EXTRACTED",
  SOURCE_VERIFIED: "SOURCE_VERIFIED",
  DISCREPANCY_DETECTED: "DISCREPANCY_DETECTED",
  RULE_EVALUATED: "RULE_EVALUATED",
  RISK_SCORED: "RISK_SCORED",
  AI_SUMMARY: "AI_SUMMARY",
  OFFICER_DECISION: "OFFICER_DECISION",
  // Bandwidth Radar (capacity-exposure layer) — separate from compliance.
  BANDWIDTH_ASSESSED: "BANDWIDTH_ASSESSED",
  OBLIGATION_LEDGER_VIEWED: "OBLIGATION_LEDGER_VIEWED",
  AWARD_SIMULATION_RUN: "AWARD_SIMULATION_RUN",
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export const ExtractionMode = {
  seeded: "seeded",
  llm: "llm",
} as const;
export type ExtractionMode = (typeof ExtractionMode)[keyof typeof ExtractionMode];

// --- Bandwidth Radar (concurrent-obligation capacity layer) -----------------
//
// This is an EXECUTION-CAPACITY EXPOSURE signal, deliberately kept separate
// from the compliance/risk score. It never qualifies or disqualifies a bidder.

/** Vendor exposure bands (see EXPOSURE_THRESHOLDS in config.ts). */
export const ExposureLevel = {
  HEALTHY: "HEALTHY",
  WATCH: "WATCH",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
} as const;
export type ExposureLevel = (typeof ExposureLevel)[keyof typeof ExposureLevel];

/** Lifecycle of a GeM award. Only ACTIVE awards contribute to exposure. */
export const AwardStatus = {
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type AwardStatus = (typeof AwardStatus)[keyof typeof AwardStatus];

/**
 * Source tag for GeM award data. The MVP uses SEEDED demo data only; a future
 * authorized/public GeM award feed would register a new source behind the same
 * provider interface without changing the exposure engine.
 */
export const GeMAwardSource = {
  SEEDED: "SEEDED",
  GEM_PUBLIC: "GEM_PUBLIC", // reserved for a future authorized integration
} as const;
export type GeMAwardSource =
  (typeof GeMAwardSource)[keyof typeof GeMAwardSource];

// --- Cross-cutting constants ------------------------------------------------

/**
 * Mandatory disclaimer. Must be shown wherever an AI verification result or
 * recommendation is presented. The AI is decision-support only.
 */
export const AI_DISCLAIMER =
  "AI-generated verification and recommendation. Final qualification/disqualification decision remains with the Procurement Officer.";

/**
 * Advisory shown wherever a Bandwidth Radar exposure figure appears. Exposure is
 * a capacity signal computed by a deterministic model from simulated award data
 * — it is decision-support only and does not qualify or disqualify a bidder.
 */
export const BANDWIDTH_DISCLAIMER =
  "Capacity signal only — a deterministic advisory estimate, not a statutory eligibility determination. It does not qualify or disqualify the bidder.";

/** Label for the simulated GeM award data source (shown wherever it is used). */
export const GEM_AWARD_DATA_LABEL = "Demo / Simulated GeM Award Data";
