/**
 * Central, tunable configuration for the compliance & risk engines.
 *
 * Everything a judge might ask "can you change this?" lives here: category
 * weights, per-result score contributions, and risk-band thresholds. Pure
 * constants + pure functions only (safe to import anywhere, including the
 * offline engine tests).
 */

import {
  ComplianceResult,
  RiskLevel,
  WeightCategory,
  type RiskLevel as RiskLevelT,
  type WeightCategory as WeightCategoryT,
  type ComplianceResult as ComplianceResultT,
} from "./types";

/**
 * Weighting of each rule category in the overall compliance score.
 * Must sum to 1.0.
 *   - Mandatory tender requirements .... 50%
 *   - Statutory compliance ............. 25%
 *   - Document validity ................ 15%
 *   - Cross-source consistency ......... 10%
 */
export const SCORE_WEIGHTS: Record<WeightCategoryT, number> = {
  [WeightCategory.MANDATORY]: 0.5,
  [WeightCategory.STATUTORY]: 0.25,
  [WeightCategory.DOCUMENT]: 0.15,
  [WeightCategory.CONSISTENCY]: 0.1,
};

/**
 * Score contribution (0..1) of each compliance result. NOT_APPLICABLE is
 * excluded from the category's denominator (returns null).
 */
export const RESULT_SCORE: Record<ComplianceResultT, number | null> = {
  [ComplianceResult.PASS]: 1.0,
  [ComplianceResult.WARNING]: 0.6,
  [ComplianceResult.PENDING]: 0.4,
  [ComplianceResult.UNVERIFIED]: 0.3,
  [ComplianceResult.FAIL]: 0.0,
  [ComplianceResult.NOT_APPLICABLE]: null,
};

/**
 * Risk bands, evaluated top-down by score (0..100).
 *   90-100 LOW | 75-89 MODERATE | 50-74 HIGH | <50 CRITICAL
 */
export const RISK_BANDS: { min: number; level: RiskLevelT }[] = [
  { min: 90, level: RiskLevel.LOW },
  { min: 75, level: RiskLevel.MODERATE },
  { min: 50, level: RiskLevel.HIGH },
  { min: 0, level: RiskLevel.CRITICAL },
];

/**
 * When true, a FAIL on any rule whose `severityOnFail` is CRITICAL forces the
 * overall risk level to CRITICAL regardless of the numeric score. Models hard
 * disqualifiers such as active debarment/blacklisting.
 */
export const CRITICAL_FAIL_FORCES_CRITICAL = true;

/** Map a 0..100 score to a risk band. */
export function riskLevelForScore(score: number): RiskLevelT {
  for (const band of RISK_BANDS) {
    if (score >= band.min) return band.level;
  }
  return RiskLevel.CRITICAL;
}

/** Score contribution for a compliance result (null => excluded). */
export function resultContribution(result: ComplianceResultT): number | null {
  return RESULT_SCORE[result];
}

/** Upload / file-validation limits (MVP-level security). */
export const UPLOAD_LIMITS = {
  maxBytes: 10 * 1024 * 1024, // 10 MB
  allowedMimeTypes: ["application/pdf", "text/plain", "image/png", "image/jpeg"],
};
