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
  ExposureLevel,
  RiskLevel,
  WeightCategory,
  type ExposureLevel as ExposureLevelT,
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

// ===========================================================================
// Bandwidth Radar — concurrent-obligation capacity model & thresholds
// ===========================================================================
//
// This layer is INDEPENDENT of the compliance score above. It answers "can the
// vendor absorb another contract?", not "is the vendor compliant?". All tunable
// numbers live here so there are no magic values scattered through the engine.

/**
 * Exposure bands, evaluated top-down by exposure % (0..∞, typically 0..100+).
 *   <60 HEALTHY | 60-80 WATCH | 80-90 HIGH | >=90 CRITICAL
 * (60 -> WATCH, 80 -> HIGH, 90 -> CRITICAL at the boundaries.)
 */
export const EXPOSURE_THRESHOLDS: { min: number; level: ExposureLevelT }[] = [
  { min: 90, level: ExposureLevel.CRITICAL },
  { min: 80, level: ExposureLevel.HIGH },
  { min: 60, level: ExposureLevel.WATCH },
  { min: 0, level: ExposureLevel.HEALTHY },
];

/**
 * Deterministic vendor-capacity model. Estimated concurrent-execution capacity
 * (in INR) is derived transparently from vendor scale:
 *
 *   estimatedCapacity =
 *       averageAnnualTurnover × turnoverConcurrentMultiple × categoryFactor
 *     + declaredWorkforce × perEmployeeCapacityInr
 *
 * Rationale: a vendor can typically carry a concurrent order book worth a
 * multiple of its annual revenue, adjusted for how much concurrency its
 * enterprise class and headcount can realistically sustain. This is an ADVISORY
 * estimate, not a statutory determination.
 */
export const CAPACITY_MODEL = {
  turnoverConcurrentMultiple: 1.5,
  perEmployeeCapacityInr: 200_000,
  /** Multiplier by MSME/enterprise class; larger firms sustain more concurrency. */
  categoryFactor: {
    Micro: 0.8,
    Small: 1.0,
    Medium: 1.15,
    Large: 1.25,
  } as Record<string, number>,
  /** Fallback class when a bidder has no declared MSME category (treated as non-MSME/large). */
  defaultCategory: "Large",
  /**
   * Exposure % beyond which a NEW award is flagged as pushing the vendor into
   * over-commitment. Aligns with the WATCH→HIGH boundary.
   */
  recommendedExposureThresholdPct: 80,
} as const;

/** Map an exposure % to its band. */
export function exposureLevelForPct(pct: number): ExposureLevelT {
  for (const band of EXPOSURE_THRESHOLDS) {
    if (pct >= band.min) return band.level;
  }
  return ExposureLevel.HEALTHY;
}

/** Resolve the capacity category factor for a (possibly missing) MSME category. */
export function capacityCategoryFactor(msmeCategory?: string | null): number {
  const key = msmeCategory && msmeCategory.trim() ? msmeCategory : CAPACITY_MODEL.defaultCategory;
  return CAPACITY_MODEL.categoryFactor[key] ?? CAPACITY_MODEL.categoryFactor[CAPACITY_MODEL.defaultCategory];
}
