import {
  ComplianceResult,
  RiskLevel,
  Severity,
  WeightCategory,
} from "../../lib/types";
import type { WeightCategory as WeightCategoryT } from "../../lib/types";
import {
  CRITICAL_FAIL_FORCES_CRITICAL,
  SCORE_WEIGHTS,
  resultContribution,
  riskLevelForScore,
} from "../../lib/config";
import type { CategoryScore, RiskResult, RuleResult } from "./types";

/**
 * Weighted risk engine.
 *
 * Score = Σ over categories ( weight · meanResultContribution ) · 100.
 * A category with no applicable rules is dropped and its weight redistributed
 * proportionally across the remaining categories, so the score always spans
 * 0..100.
 *
 * If any CRITICAL-severity rule FAILs (e.g. active debarment), the overall risk
 * level is forced to CRITICAL regardless of the numeric score — a hard
 * disqualifier gate. The numeric score is still reported for transparency.
 */
export function computeRisk(ruleResults: RuleResult[]): RiskResult {
  const categories: WeightCategoryT[] = [
    WeightCategory.MANDATORY,
    WeightCategory.STATUTORY,
    WeightCategory.DOCUMENT,
    WeightCategory.CONSISTENCY,
  ];

  const raw: CategoryScore[] = categories.map((category) => {
    const inCat = ruleResults.filter((r) => r.weightCategory === category);
    const contributions: number[] = [];
    for (const r of inCat) {
      const c = resultContribution(r.result);
      if (c !== null) contributions.push(c); // NOT_APPLICABLE excluded
    }
    const ratio =
      contributions.length > 0
        ? contributions.reduce((s, v) => s + v, 0) / contributions.length
        : null;
    return {
      category,
      weight: SCORE_WEIGHTS[category],
      ratio,
      points: 0, // filled after weight redistribution
      ruleCount: contributions.length,
    };
  });

  // Redistribute weight across categories that actually have applicable rules.
  const active = raw.filter((c) => c.ratio !== null);
  const activeWeight = active.reduce((s, c) => s + c.weight, 0);

  const breakdown: CategoryScore[] = raw.map((c) => {
    if (c.ratio === null || activeWeight === 0) return { ...c, points: 0 };
    const effectiveWeight = c.weight / activeWeight;
    return { ...c, points: effectiveWeight * c.ratio * 100 };
  });

  const score = Math.round(
    breakdown.reduce((s, c) => s + c.points, 0),
  );

  // Hard disqualifier gate.
  let forcedCritical = false;
  let forcedReason: string | undefined;
  if (CRITICAL_FAIL_FORCES_CRITICAL) {
    const criticalFail = ruleResults.find(
      (r) =>
        r.result === ComplianceResult.FAIL &&
        r.severityOnFail === Severity.CRITICAL,
    );
    if (criticalFail) {
      forcedCritical = true;
      forcedReason = `${criticalFail.title} (${criticalFail.code}) failed a CRITICAL-severity check.`;
    }
  }

  const level = forcedCritical ? RiskLevel.CRITICAL : riskLevelForScore(score);

  return { score, level, breakdown, forcedCritical, forcedReason };
}
