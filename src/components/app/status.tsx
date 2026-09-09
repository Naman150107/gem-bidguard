import * as React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  HelpCircle,
  MinusCircle,
  ShieldCheck,
  ShieldAlert,
  Ban,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import {
  ComplianceResult,
  RiskLevel,
  Severity,
  ProviderStatus,
  DecisionStatus,
  type ComplianceResult as ComplianceResultT,
  type RiskLevel as RiskLevelT,
  type Severity as SeverityT,
  type ProviderStatus as ProviderStatusT,
  type DecisionStatus as DecisionStatusT,
} from "@/lib/types";

type Variant = NonNullable<BadgeProps["variant"]>;

// --- Risk -------------------------------------------------------------------

const RISK_VARIANT: Record<RiskLevelT, Variant> = {
  [RiskLevel.LOW]: "success",
  [RiskLevel.MODERATE]: "warning",
  [RiskLevel.HIGH]: "destructive",
  [RiskLevel.CRITICAL]: "destructive",
};

/** Hex colors for charts / gauges, aligned with the theme. */
export const RISK_COLOR: Record<RiskLevelT, string> = {
  [RiskLevel.LOW]: "#1a7f4b",
  [RiskLevel.MODERATE]: "#c77d0a",
  [RiskLevel.HIGH]: "#d1462f",
  [RiskLevel.CRITICAL]: "#b91c1c",
};

export function RiskBadge({ level }: { level: RiskLevelT | null | undefined }) {
  if (!level) return <Badge variant="secondary">Not verified</Badge>;
  const Icon = level === RiskLevel.LOW ? ShieldCheck : ShieldAlert;
  return (
    <Badge variant={RISK_VARIANT[level]} className="gap-1">
      <Icon className="h-3.5 w-3.5" />
      {level}
    </Badge>
  );
}

// --- Compliance result ------------------------------------------------------

const RESULT_META: Record<
  ComplianceResultT,
  { variant: Variant; Icon: typeof CheckCircle2; label: string }
> = {
  [ComplianceResult.PASS]: { variant: "success", Icon: CheckCircle2, label: "Pass" },
  [ComplianceResult.WARNING]: { variant: "warning", Icon: AlertTriangle, label: "Warning" },
  [ComplianceResult.FAIL]: { variant: "destructive", Icon: XCircle, label: "Fail" },
  [ComplianceResult.PENDING]: { variant: "secondary", Icon: Clock, label: "Pending" },
  [ComplianceResult.UNVERIFIED]: { variant: "outline", Icon: HelpCircle, label: "Unverified" },
  [ComplianceResult.NOT_APPLICABLE]: { variant: "secondary", Icon: MinusCircle, label: "N/A" },
};

export function ResultBadge({ result }: { result: ComplianceResultT }) {
  const meta = RESULT_META[result];
  return (
    <Badge variant={meta.variant} className="gap-1">
      <meta.Icon className="h-3.5 w-3.5" />
      {meta.label}
    </Badge>
  );
}

// --- Severity ---------------------------------------------------------------

const SEVERITY_VARIANT: Record<SeverityT, Variant> = {
  [Severity.CRITICAL]: "destructive",
  [Severity.HIGH]: "destructive",
  [Severity.MEDIUM]: "warning",
  [Severity.LOW]: "secondary",
  [Severity.INFO]: "default",
};

export function SeverityBadge({ severity }: { severity: SeverityT }) {
  return <Badge variant={SEVERITY_VARIANT[severity]}>{severity}</Badge>;
}

// --- Provider status --------------------------------------------------------

const PROVIDER_META: Record<
  ProviderStatusT,
  { variant: Variant; label: string }
> = {
  [ProviderStatus.VERIFIED]: { variant: "success", label: "Verified" },
  [ProviderStatus.MISMATCH]: { variant: "destructive", label: "Mismatch" },
  [ProviderStatus.NOT_FOUND]: { variant: "warning", label: "Not found" },
  [ProviderStatus.UNVERIFIED]: { variant: "outline", label: "Unverified" },
  [ProviderStatus.ERROR]: { variant: "destructive", label: "Error" },
};

export function ProviderStatusBadge({ status }: { status: ProviderStatusT }) {
  const meta = PROVIDER_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

// --- Officer decision -------------------------------------------------------

const DECISION_META: Record<
  DecisionStatusT,
  { variant: Variant; Icon: typeof CheckCircle2; label: string }
> = {
  [DecisionStatus.QUALIFIED]: { variant: "success", Icon: CheckCircle2, label: "Qualified" },
  [DecisionStatus.REJECTED]: { variant: "destructive", Icon: Ban, label: "Rejected" },
  [DecisionStatus.PENDING]: { variant: "secondary", Icon: Clock, label: "Pending decision" },
};

export function DecisionBadge({ status }: { status: DecisionStatusT }) {
  const meta = DECISION_META[status];
  return (
    <Badge variant={meta.variant} className="gap-1">
      <meta.Icon className="h-3.5 w-3.5" />
      {meta.label}
    </Badge>
  );
}
