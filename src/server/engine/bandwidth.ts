/**
 * Bandwidth Radar — deterministic capacity-exposure engine.
 *
 * Answers ONE question: "can this vendor realistically absorb another contract
 * given its current concurrent GeM obligations?" It is a CAPACITY SIGNAL, kept
 * deliberately separate from the compliance/risk engine. It never qualifies or
 * disqualifies a bidder — that decision stays with the Procurement Officer.
 *
 * PURE MODULE: depends only on `../../lib/config` and `../../lib/types`. No
 * Prisma, no server-only, no I/O — so the offline test harness
 * (`scripts/verify-bandwidth.ts`, run via Node's type-stripping loader) can
 * import and exercise it directly, exactly like the compliance engine.
 *
 * The LLM does NOT compute any of this. Every number below comes from the
 * transparent formulae in CAPACITY_MODEL / EXPOSURE_THRESHOLDS.
 */

import {
  CAPACITY_MODEL,
  capacityCategoryFactor,
  exposureLevelForPct,
} from "../../lib/config";
import {
  AwardStatus,
  ExposureLevel,
  type AwardStatus as AwardStatusT,
  type ExposureLevel as ExposureLevelT,
} from "../../lib/types";
import { formatINR } from "../../lib/utils";

// ---------------------------------------------------------------------------
// Inputs / outputs
// ---------------------------------------------------------------------------

/** A GeM award as the exposure engine consumes it (subset of the DB row). */
export interface BandwidthAward {
  referenceNo: string;
  title: string;
  category: string;
  procuringOrg: string;
  state: string;
  awardValue: number;
  status: AwardStatusT;
  awardDate?: string | null;
  contractStart?: string | null;
  expectedCompletion?: string | null;
}

/** Server-trusted capacity inputs (never taken from the client). */
export interface CapacityInputs {
  /** Average annual turnover in INR. */
  turnover: number;
  /** Declared workforce headcount. */
  workforce: number;
  /** MSME/enterprise class; missing => treated as the default (non-MSME) class. */
  msmeCategory?: string | null;
}

/** Transparent breakdown of the estimated concurrent-execution capacity. */
export interface CapacityResult {
  estimatedCapacity: number;
  categoryUsed: string;
  categoryFactor: number;
  turnoverComponent: number;
  workforceComponent: number;
  recommendedExposureThresholdPct: number;
  /** Human-readable derivation, shown in the UI and stored for audit. */
  basis: string;
}

/** One award annotated with whether it contributes to live exposure. */
export interface ExposureAwardLine {
  referenceNo: string;
  title: string;
  category: string;
  procuringOrg: string;
  state: string;
  awardValue: number;
  status: AwardStatusT;
  awardDate?: string | null;
  contractStart?: string | null;
  expectedCompletion?: string | null;
  included: boolean;
  reason: string;
}

/** Full exposure computation for a vendor. */
export interface BandwidthResult {
  estimatedCapacity: number;
  activeObligationValue: number;
  activeContractCount: number;
  /** Active load / capacity × 100, rounded to 2 dp. */
  exposurePct: number;
  exposureLevel: ExposureLevelT;
  remainingCapacityValue: number;
  remainingCapacityPct: number;
  includedAwards: ExposureAwardLine[];
  excludedAwards: ExposureAwardLine[];
  /** Explicit formula string, e.g. "₹6.38 Cr ÷ ₹8.18 Cr × 100 = 78.04%". */
  math: string;
}

/** Inputs for a what-if "new award" simulation (validated at the API edge). */
export interface SimulationInput {
  proposedValue: number;
  /** Informational only — does not change the exposure math. */
  proposedDurationMonths?: number;
  proposedCategory?: string;
  proposedState?: string;
}

/** Result of a what-if simulation. Never mutates the underlying awards. */
export interface SimulationResult {
  estimatedCapacity: number;
  proposedValue: number;
  current: {
    obligationValue: number;
    exposurePct: number;
    exposureLevel: ExposureLevelT;
  };
  projected: {
    obligationValue: number;
    exposurePct: number;
    exposureLevel: ExposureLevelT;
  };
  deltaPct: number;
  recommendedThresholdPct: number;
  /** Projected exposure is at/above the recommended threshold. */
  projectedAboveThreshold: boolean;
  /** Currently below the threshold but the new award pushes it at/above. */
  crossesRecommendedThreshold: boolean;
  /** The new award moves the vendor into a worse exposure band. */
  worsensLevel: boolean;
  math: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Worst-to-best ordering used to decide if a band got worse. */
const LEVEL_ORDER: Record<ExposureLevelT, number> = {
  [ExposureLevel.HEALTHY]: 0,
  [ExposureLevel.WATCH]: 1,
  [ExposureLevel.HIGH]: 2,
  [ExposureLevel.CRITICAL]: 3,
};

/** Round to 2 decimal places (deterministic, avoids float noise in the UI). */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function exposurePctFor(obligation: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return round2((obligation / capacity) * 100);
}

// ---------------------------------------------------------------------------
// 1. Capacity
// ---------------------------------------------------------------------------

/**
 * Deterministic estimate of a vendor's concurrent-execution capacity (INR):
 *
 *   estimatedCapacity = turnover × turnoverConcurrentMultiple × categoryFactor
 *                     + workforce × perEmployeeCapacityInr
 *
 * Advisory only — a transparent proxy for how large a concurrent order book the
 * vendor can realistically sustain, NOT a statutory eligibility threshold.
 */
export function computeCapacity(inputs: CapacityInputs): CapacityResult {
  const categoryUsed =
    inputs.msmeCategory && inputs.msmeCategory.trim()
      ? inputs.msmeCategory
      : CAPACITY_MODEL.defaultCategory;
  const factor = capacityCategoryFactor(inputs.msmeCategory);

  const turnoverComponent = Math.round(
    inputs.turnover * CAPACITY_MODEL.turnoverConcurrentMultiple * factor,
  );
  const workforceComponent = Math.round(
    inputs.workforce * CAPACITY_MODEL.perEmployeeCapacityInr,
  );
  const estimatedCapacity = turnoverComponent + workforceComponent;

  const basis =
    `${formatINR(inputs.turnover)} turnover × ${CAPACITY_MODEL.turnoverConcurrentMultiple} ` +
    `× ${factor} (${categoryUsed}) = ${formatINR(turnoverComponent)}; ` +
    `+ ${inputs.workforce} staff × ${formatINR(CAPACITY_MODEL.perEmployeeCapacityInr)} ` +
    `= ${formatINR(workforceComponent)}; total ≈ ${formatINR(estimatedCapacity)}.`;

  return {
    estimatedCapacity,
    categoryUsed,
    categoryFactor: factor,
    turnoverComponent,
    workforceComponent,
    recommendedExposureThresholdPct: CAPACITY_MODEL.recommendedExposureThresholdPct,
    basis,
  };
}

// ---------------------------------------------------------------------------
// 2. Exposure
// ---------------------------------------------------------------------------

function toLine(a: BandwidthAward, included: boolean, reason: string): ExposureAwardLine {
  return {
    referenceNo: a.referenceNo,
    title: a.title,
    category: a.category,
    procuringOrg: a.procuringOrg,
    state: a.state,
    awardValue: a.awardValue,
    status: a.status,
    awardDate: a.awardDate ?? null,
    contractStart: a.contractStart ?? null,
    expectedCompletion: a.expectedCompletion ?? null,
    included,
    reason,
  };
}

/**
 * Compute a vendor's live capacity exposure. ONLY awards with status ACTIVE
 * contribute; COMPLETED and CANCELLED awards are excluded (and reported as such
 * for full traceability).
 */
export function computeExposure(
  awards: BandwidthAward[],
  estimatedCapacity: number,
): BandwidthResult {
  const includedAwards: ExposureAwardLine[] = [];
  const excludedAwards: ExposureAwardLine[] = [];
  let activeObligationValue = 0;

  for (const a of awards) {
    if (a.status === AwardStatus.ACTIVE) {
      activeObligationValue += a.awardValue;
      includedAwards.push(toLine(a, true, "Active concurrent obligation."));
    } else if (a.status === AwardStatus.COMPLETED) {
      excludedAwards.push(toLine(a, false, "Completed — no longer a live obligation."));
    } else {
      excludedAwards.push(toLine(a, false, "Cancelled — never a live obligation."));
    }
  }

  const exposurePct = exposurePctFor(activeObligationValue, estimatedCapacity);
  const exposureLevel = exposureLevelForPct(exposurePct);
  const remainingCapacityValue = Math.max(0, estimatedCapacity - activeObligationValue);
  const remainingCapacityPct = round2(Math.max(0, 100 - exposurePct));

  const math =
    `${formatINR(activeObligationValue)} active load ÷ ${formatINR(estimatedCapacity)} capacity ` +
    `× 100 = ${exposurePct.toFixed(2)}% (${exposureLevel}); ` +
    `${includedAwards.length} active, ${excludedAwards.length} excluded.`;

  return {
    estimatedCapacity,
    activeObligationValue,
    activeContractCount: includedAwards.length,
    exposurePct,
    exposureLevel,
    remainingCapacityValue,
    remainingCapacityPct,
    includedAwards,
    excludedAwards,
    math,
  };
}

// ---------------------------------------------------------------------------
// 3. What-if simulation
// ---------------------------------------------------------------------------

/**
 * Project exposure if a NEW award of `proposedValue` were added on top of the
 * current active obligations. Pure — it takes the already-computed current
 * exposure and returns a new projection; it never touches stored award data.
 */
export function simulateAward(
  current: BandwidthResult,
  input: SimulationInput,
): SimulationResult {
  const proposedValue = Math.max(0, Math.round(input.proposedValue));
  const projectedObligation = current.activeObligationValue + proposedValue;

  const projectedPct = exposurePctFor(projectedObligation, current.estimatedCapacity);
  const projectedLevel = exposureLevelForPct(projectedPct);
  const threshold = CAPACITY_MODEL.recommendedExposureThresholdPct;

  const projectedAboveThreshold = projectedPct >= threshold;
  const crossesRecommendedThreshold =
    current.exposurePct < threshold && projectedAboveThreshold;
  const worsensLevel =
    LEVEL_ORDER[projectedLevel] > LEVEL_ORDER[current.exposureLevel];

  const math =
    `(${formatINR(current.activeObligationValue)} + ${formatINR(proposedValue)} proposed) ` +
    `÷ ${formatINR(current.estimatedCapacity)} × 100 = ${projectedPct.toFixed(2)}% ` +
    `(was ${current.exposurePct.toFixed(2)}% ${current.exposureLevel} → ${projectedLevel}).`;

  return {
    estimatedCapacity: current.estimatedCapacity,
    proposedValue,
    current: {
      obligationValue: current.activeObligationValue,
      exposurePct: current.exposurePct,
      exposureLevel: current.exposureLevel,
    },
    projected: {
      obligationValue: projectedObligation,
      exposurePct: projectedPct,
      exposureLevel: projectedLevel,
    },
    deltaPct: round2(projectedPct - current.exposurePct),
    recommendedThresholdPct: threshold,
    projectedAboveThreshold,
    crossesRecommendedThreshold,
    worsensLevel,
    math,
  };
}
