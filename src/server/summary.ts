import { ComplianceResult, RiskLevel } from "../lib/types";
import type { Discrepancy, RiskResult, RuleResult } from "./engine/types";

/**
 * Generates the human-readable summary and recommendation shown to the officer.
 *
 * This is DECISION-SUPPORT narration only. It describes what the deterministic
 * engine found and suggests a course of action, but the officer makes the final
 * call. The wording is produced deterministically from engine output so it is
 * stable offline; a real deployment could route the same inputs to an LLM for
 * richer phrasing without changing the underlying facts or the recommendation
 * logic.
 */

export interface SummaryOutput {
  summary: string;
  recommendation: string;
}

const RISK_ADVICE: Record<string, string> = {
  [RiskLevel.LOW]:
    "Recommended for qualification, subject to officer confirmation. No blocking issues detected.",
  [RiskLevel.MODERATE]:
    "Qualification is possible but the officer should review the flagged warnings before deciding.",
  [RiskLevel.HIGH]:
    "Significant compliance gaps detected. Officer review is required; seek clarifications or supporting documents before qualifying.",
  [RiskLevel.CRITICAL]:
    "Strong grounds for disqualification. Critical checks failed; the officer should review the evidence and record a decision.",
};

export function generateSummary(
  bidderName: string,
  risk: RiskResult,
  ruleResults: RuleResult[],
  discrepancies: Discrepancy[],
): SummaryOutput {
  const fails = ruleResults.filter((r) => r.result === ComplianceResult.FAIL);
  const warns = ruleResults.filter((r) => r.result === ComplianceResult.WARNING);
  const pending = ruleResults.filter((r) => r.result === ComplianceResult.PENDING);
  const passes = ruleResults.filter((r) => r.result === ComplianceResult.PASS);

  const parts: string[] = [];
  parts.push(
    `${bidderName} scored ${risk.score}/100, placing this bid in the ${risk.level} risk band.`,
  );

  if (risk.forcedCritical && risk.forcedReason) {
    parts.push(`Risk was elevated to CRITICAL because ${risk.forcedReason}`);
  }

  parts.push(
    `${passes.length} check(s) passed, ${warns.length} raised warnings, ${fails.length} failed, and ${pending.length} could not be determined automatically.`,
  );

  if (fails.length > 0) {
    parts.push(
      `Failed checks: ${fails.map((f) => `${f.title} — ${f.detail}`).join(" ")}`,
    );
  }
  if (warns.length > 0) {
    parts.push(
      `Warnings: ${warns.map((w) => `${w.title} — ${w.detail}`).join(" ")}`,
    );
  }
  if (discrepancies.length > 0) {
    parts.push(
      `Cross-source discrepancies: ${discrepancies.map((d) => d.description).join(" ")}`,
    );
  }
  if (pending.length > 0) {
    parts.push(
      `Requires manual verification: ${pending.map((p) => p.title).join(", ")}.`,
    );
  }

  const recommendation = RISK_ADVICE[risk.level] ?? RISK_ADVICE[RiskLevel.HIGH];

  return { summary: parts.join(" "), recommendation };
}
