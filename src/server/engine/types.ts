import type {
  ComplianceResult as ComplianceResultT,
  DiscrepancyKind as DiscrepancyKindT,
  RiskLevel as RiskLevelT,
  Severity as SeverityT,
  WeightCategory as WeightCategoryT,
} from "../../lib/types";
import type { ExtractedProfile } from "../ai/types";
import type { ProviderResult } from "../providers/types";

/** A compliance rule as the engine consumes it (subset of the DB Rule). */
export interface EngineRule {
  code: string;
  title: string;
  description: string;
  weightCategory: WeightCategoryT;
  severityOnFail: SeverityT;
  config?: Record<string, unknown> | null;
}

/** A tender requirement as the engine consumes it. */
export interface EngineRequirement {
  code: string;
  title: string;
  mandatory: boolean;
  category: string;
}

/** Everything a rule handler needs to evaluate one bidder. */
export interface VerificationInput {
  bidder: {
    name: string;
    legalName: string;
    pan: string;
    gstin: string;
    cin?: string | null;
    udyamNumber?: string | null;
    address: string;
    declaredLocalContentPct?: number | null;
  };
  profile: ExtractedProfile;
  providers: Record<string, ProviderResult | undefined>;
  requirements: EngineRequirement[];
  rules: EngineRule[];
  presentDocumentTypes: string[];
}

/** Output of evaluating one rule. */
export interface RuleResult {
  code: string;
  title: string;
  weightCategory: WeightCategoryT;
  result: ComplianceResultT;
  severityOnFail: SeverityT;
  detail: string;
  /** Evidence references (source payloads, doc fields) for audit. */
  evidence?: Record<string, unknown>;
}

/** A detected cross-source discrepancy. */
export interface Discrepancy {
  kind: DiscrepancyKindT;
  severity: SeverityT;
  description: string;
  sources: string[];
}

/** Per-category score contribution. */
export interface CategoryScore {
  category: WeightCategoryT;
  weight: number;
  /** Mean result contribution across applicable rules, 0..1 (null if none). */
  ratio: number | null;
  /** weight * ratio * 100, contribution to the final score. */
  points: number;
  ruleCount: number;
}

/** Full risk computation output. */
export interface RiskResult {
  score: number;
  level: RiskLevelT;
  breakdown: CategoryScore[];
  forcedCritical: boolean;
  forcedReason?: string;
}
