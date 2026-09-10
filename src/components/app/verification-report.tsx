import {
  ShieldAlert,
  Landmark,
  FileSearch,
  GitCompareArrows,
  Sparkles,
  ClipboardCheck,
  FileText,
  Database,
  Clock,
  Scale,
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { ScoreGauge } from "@/components/app/score-gauge";
import {
  RiskBadge,
  ResultBadge,
  SeverityBadge,
  ProviderStatusBadge,
  DecisionBadge,
} from "@/components/app/status";
import { DisclaimerBanner } from "@/components/app/disclaimer";
import { DecisionPanel } from "@/components/app/decision-panel";
import { AuditTrail } from "@/components/app/audit-trail";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { humanizeGovSource, humanizeDocType } from "@/lib/doc-labels";
import { formatDateTime, pct } from "@/lib/utils";
import {
  ComplianceResult,
  WeightCategory,
  DecisionStatus,
  type ComplianceResult as ComplianceResultT,
  type WeightCategory as WeightCategoryT,
  type RiskLevel as RiskLevelT,
  type Severity as SeverityT,
  type ProviderStatus as ProviderStatusT,
  type DecisionStatus as DecisionStatusT,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Loose structural types so both getBidderDetail().runs[0] and getRunById()
// can be passed without duplicating Prisma include shapes.
// ---------------------------------------------------------------------------

interface RuleResultLike {
  id: string;
  ruleCode: string;
  ruleTitle: string;
  category: string;
  result: string;
  detail: string;
  evidence?: unknown;
}

interface FindingLike {
  id: string;
  finding: string;
  severity: string;
  confidence: number;
  evidence?: unknown;
  affectedRequirement?: string | null;
  source: string;
}

interface DiscrepancyLike {
  id: string;
  kind: string;
  severity: string;
  description: string;
  sources: unknown;
}

interface ProviderResultLike {
  id: string;
  source: string;
  status: string;
  confidence?: number | null;
  payload: unknown;
  isMock: boolean;
}

interface AuditEventLike {
  id: string;
  timestamp: Date;
  officer: string;
  action: string;
  source?: string | null;
  rule?: string | null;
  result?: string | null;
  decision?: string | null;
}

export interface RequirementLike {
  id: string;
  code: string;
  title: string;
  description: string;
  mandatory: boolean;
  category: string;
}

export interface ReportRunLike {
  id: string;
  status: string;
  complianceScore?: number | null;
  riskLevel?: string | null;
  decisionStatus?: string | null;
  summary?: string | null;
  recommendation?: string | null;
  extractionMode?: string | null;
  startedAt: Date;
  scoreBreakdown?: unknown;
  ruleResults: RuleResultLike[];
  findings: FindingLike[];
  discrepancies: DiscrepancyLike[];
  providerResults: ProviderResultLike[];
  auditEvents: AuditEventLike[];
}

const CATEGORY_LABEL: Record<WeightCategoryT, string> = {
  [WeightCategory.MANDATORY]: "Mandatory requirements",
  [WeightCategory.STATUTORY]: "Statutory compliance",
  [WeightCategory.DOCUMENT]: "Document validity",
  [WeightCategory.CONSISTENCY]: "Cross-source consistency",
};

const CATEGORY_HINT: Record<WeightCategoryT, string> = {
  [WeightCategory.MANDATORY]: "50% weight · EMD, turnover, OEM, experience, local content",
  [WeightCategory.STATUTORY]: "25% weight · GST, PAN, EPFO, ESIC, debarment",
  [WeightCategory.DOCUMENT]: "15% weight · completeness + expiry",
  [WeightCategory.CONSISTENCY]: "10% weight · PAN / GSTIN / name / address match",
};

const CATEGORY_ORDER: WeightCategoryT[] = [
  WeightCategory.MANDATORY,
  WeightCategory.STATUTORY,
  WeightCategory.DOCUMENT,
  WeightCategory.CONSISTENCY,
];

interface BreakdownRow {
  category: WeightCategoryT;
  weight: number;
  ratio: number | null;
  points: number;
  ruleCount: number;
}

function ratioTint(ratio: number | null): string {
  if (ratio === null) return "bg-muted-foreground/40";
  if (ratio >= 0.9) return "bg-success";
  if (ratio >= 0.6) return "bg-warning";
  return "bg-destructive";
}

function resultRowTint(result: string): string {
  switch (result) {
    case ComplianceResult.FAIL:
      return "border-l-4 border-l-destructive bg-destructive/[0.04]";
    case ComplianceResult.WARNING:
      return "border-l-4 border-l-warning bg-warning/[0.06]";
    case ComplianceResult.PENDING:
    case ComplianceResult.UNVERIFIED:
      return "border-l-4 border-l-muted-foreground/40 bg-muted/30";
    case ComplianceResult.PASS:
      return "border-l-4 border-l-success bg-success/[0.04]";
    default:
      return "border-l-4 border-l-muted bg-muted/20";
  }
}

/** Tender requirement -> deterministic rule(s) that decide its status. */
const REQ_RULE_MAP: Record<string, string[]> = {
  "REQ-EMD": ["RULE-EMD"],
  "REQ-TURNOVER": ["RULE-TURNOVER"],
  "REQ-OEM": ["RULE-OEM"],
  "REQ-EXP": ["RULE-EXP"],
  "REQ-LOCAL-CONTENT": ["RULE-LOCAL-CONTENT"],
  "REQ-GST": ["RULE-GST"],
  "REQ-PAN": ["RULE-PAN"],
  "REQ-LABOUR": ["RULE-EPFO", "RULE-ESIC"],
  "REQ-BLACKLIST": ["RULE-BLACKLIST"],
  // REQ-UDYAM is optional with no dedicated rule — resolved from the
  // Udyam provider result (see requirementStatus).
};

/** Deterministic rule -> authoritative government source that backs it. */
const RULE_SOURCE_MAP: Record<string, string> = {
  "RULE-GST": "GST",
  "RULE-PAN": "PAN",
  "RULE-EPFO": "EPFO",
  "RULE-ESIC": "ESIC",
  "RULE-BLACKLIST": "DEBARMENT",
  "RULE-PAN-CONSISTENCY": "PAN",
  "RULE-GSTIN-CONSISTENCY": "GST",
  "RULE-NAME-CONSISTENCY": "MCA",
  "RULE-ADDRESS-CONSISTENCY": "GST",
};

const WORST_ORDER: ComplianceResultT[] = [
  ComplianceResult.FAIL,
  ComplianceResult.WARNING,
  ComplianceResult.PENDING,
  ComplianceResult.UNVERIFIED,
  ComplianceResult.PASS,
  ComplianceResult.NOT_APPLICABLE,
];

function worstOf(results: ComplianceResultT[]): ComplianceResultT {
  for (const r of WORST_ORDER) if (results.includes(r)) return r;
  return ComplianceResult.PENDING;
}

function normalizeSources(sources: unknown): string[] {
  if (Array.isArray(sources)) return sources.map((s) => String(s));
  if (sources && typeof sources === "object")
    return Object.values(sources as Record<string, unknown>).map((v) => String(v));
  if (typeof sources === "string") return [sources];
  return [];
}

function prettyJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function Evidence({ value, label = "View raw evidence" }: { value: unknown; label?: string }) {
  const text = prettyJson(value);
  if (!text || text === "null" || text === "{}" || text === "[]") return null;
  return (
    <details className="mt-1.5 text-xs">
      <summary className="cursor-pointer text-muted-foreground underline-offset-2 hover:underline">
        {label}
      </summary>
      <pre className="mt-1 max-h-48 overflow-auto rounded border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
        {text}
      </pre>
    </details>
  );
}

function formatScalar(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") return String(v);
  const s = String(v).trim();
  return s === "" ? "—" : s;
}

/** Preferred human-readable keys per government source, in display order. */
const PAYLOAD_KEY_ORDER: Record<string, { key: string; label: string }[]> = {
  GST: [
    { key: "gstin", label: "GSTIN" },
    { key: "legalName", label: "Legal name (govt)" },
    { key: "pan", label: "PAN (govt)" },
    { key: "registrationStatus", label: "Registration status" },
    { key: "address", label: "Address (govt)" },
  ],
  PAN: [
    { key: "pan", label: "PAN" },
    { key: "name", label: "Name (govt)" },
    { key: "status", label: "Status" },
  ],
  UDYAM: [
    { key: "udyamNumber", label: "Udyam number" },
    { key: "enterpriseType", label: "Enterprise type" },
    { key: "pan", label: "PAN (govt)" },
    { key: "status", label: "Status" },
  ],
  MCA: [
    { key: "cin", label: "CIN" },
    { key: "companyName", label: "Company name (govt)" },
    { key: "status", label: "Status" },
  ],
  EPFO: [
    { key: "establishmentCode", label: "Establishment code" },
    { key: "status", label: "Status" },
    { key: "pan", label: "PAN (govt)" },
  ],
  ESIC: [
    { key: "esicCode", label: "ESIC code" },
    { key: "status", label: "Status" },
    { key: "pan", label: "PAN (govt)" },
  ],
  DEBARMENT: [
    { key: "debarred", label: "Debarred?" },
    { key: "authority", label: "Authority" },
    { key: "reason", label: "Reason" },
    { key: "periodFrom", label: "Period from" },
    { key: "periodTo", label: "Period to" },
  ],
};

function payloadRows(source: string, payload: unknown): { label: string; value: string }[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const order = PAYLOAD_KEY_ORDER[source];
  const rows: { label: string; value: string }[] = [];
  if (order) {
    for (const { key, label } of order) {
      if (key in record) rows.push({ label, value: formatScalar(record[key]) });
    }
    return rows;
  }
  // Generic fallback: show scalar top-level fields (max 6).
  for (const [key, val] of Object.entries(record)) {
    if (val === null || val === undefined) continue;
    if (typeof val === "object") continue;
    rows.push({ label: key, value: formatScalar(val) });
    if (rows.length >= 6) break;
  }
  return rows;
}

/** Lookup timestamp of the SOURCE_VERIFIED audit event for a source. */
function verifiedAtFor(
  source: string,
  events: AuditEventLike[],
  fallback: Date,
): Date {
  const hit = events.find((e) => e.action === "SOURCE_VERIFIED" && e.source === source);
  return hit ? hit.timestamp : fallback;
}

/** Pull quoted / parenthesised values out of a discrepancy description for side-by-side display. */
function extractConflictingValues(description: string): string[] {
  const out: string[] = [];
  const quoted = description.match(/"([^"]{2,120})"/g) ?? [];
  for (const q of quoted) {
    const v = q.replace(/^"|"$/g, "").trim();
    if (v && !out.includes(v)) out.push(v);
  }
  const paren = description.match(/\(([^()]{3,60})\)/g) ?? [];
  for (const p of paren) {
    const v = p.replace(/^\(|\)$/g, "").trim();
    // Keep identifier-like values (GSTIN/PAN/codes), skip prose.
    if (/^[A-Z0-9][A-Z0-9\-/ ]{2,}$/i.test(v) && !out.includes(v) && out.length < 4) out.push(v);
  }
  return out.slice(0, 4);
}

function severityTint(severity: string): string {
  switch (severity) {
    case "CRITICAL":
    case "HIGH":
      return "border-destructive/40 bg-destructive/[0.05]";
    case "MEDIUM":
      return "border-warning/40 bg-warning/[0.06]";
    default:
      return "border-border bg-card";
  }
}

export function requirementStatus(
  reqCode: string,
  ruleResults: RuleResultLike[],
  providerResults: ProviderResultLike[],
): { status: ComplianceResultT; linked: RuleResultLike[]; note?: string } {
  const codes = REQ_RULE_MAP[reqCode] ?? [];
  const linked = ruleResults.filter((r) => codes.includes(r.ruleCode));
  if (linked.length > 0) {
    return {
      status: worstOf(linked.map((r) => r.result as ComplianceResultT)),
      linked,
    };
  }
  // Optional Udyam requirement: derive from the Udyam provider check.
  if (reqCode === "REQ-UDYAM") {
    const udyam = providerResults.find((p) => p.source === "UDYAM");
    if (udyam?.status === "VERIFIED") {
      return { status: ComplianceResult.PASS, linked: [], note: "Udyam registration verified on government record." };
    }
    return {
      status: ComplianceResult.NOT_APPLICABLE,
      linked: [],
      note: "Optional requirement — no Udyam registration found; no exemption claimed on this basis.",
    };
  }
  return { status: ComplianceResult.PENDING, linked: [], note: "No deterministic check mapped — requires manual review." };
}

function confidenceTone(conf: number): string {
  if (conf >= 0.9) return "text-success";
  if (conf >= 0.7) return "text-warning";
  return "text-destructive";
}

/**
 * Full demo-ready verification report. Rendered inline on /bidders/[id] for
 * the latest run and reused by /verification/[id]. Pure presentation over the
 * existing backend output — no engine logic duplicated here.
 *
 * Narrative order: AI extraction → Evidence → Government verification →
 * Discrepancy → Rule result → Risk → Recommendation → Officer decision.
 */
export function VerificationReport({
  run,
  requirements,
  officerName,
}: {
  run: ReportRunLike;
  requirements: RequirementLike[];
  officerName: string;
}) {
  const breakdown = (run.scoreBreakdown as unknown as BreakdownRow[] | null) ?? [];
  const breakdownByCat = new Map(breakdown.map((b) => [b.category, b]));

  const resultsByCat = new Map<string, RuleResultLike[]>();
  for (const rr of run.ruleResults) {
    const list = resultsByCat.get(rr.category) ?? [];
    list.push(rr);
    resultsByCat.set(rr.category, list);
  }

  const isForcedCritical =
    run.riskLevel === "CRITICAL" &&
    typeof run.complianceScore === "number" &&
    (run.complianceScore as number) >= 50;

  const passCount = run.ruleResults.filter((r) => r.result === ComplianceResult.PASS).length;
  const failCount = run.ruleResults.filter((r) => r.result === ComplianceResult.FAIL).length;
  const warnCount = run.ruleResults.filter((r) => r.result === ComplianceResult.WARNING).length;
  const pendCount = run.ruleResults.filter(
    (r) => r.result === ComplianceResult.PENDING || r.result === ComplianceResult.UNVERIFIED,
  ).length;
  const verifiedProviders = run.providerResults.filter((p) => p.status === "VERIFIED").length;

  const steps = [
    { n: 1, label: "AI extraction", detail: `${run.findings.length} finding(s)` },
    { n: 2, label: "Govt verification", detail: `${verifiedProviders}/${run.providerResults.length} verified` },
    { n: 3, label: "Discrepancies", detail: `${run.discrepancies.length} flagged` },
    { n: 4, label: "Rule results", detail: `${passCount} pass · ${failCount} fail` },
    { n: 5, label: "Risk & score", detail: `${run.complianceScore ?? "—"} · ${run.riskLevel ?? "—"}` },
    { n: 6, label: "Recommendation", detail: run.recommendation ? "AI advisory" : "—" },
    { n: 7, label: "Officer decision", detail: (run.decisionStatus as string) ?? "PENDING" },
  ];

  return (
    <div className="space-y-6">
      <DisclaimerBanner />

      {/* How to read this report — pipeline */}
      <Card className="border-dashed">
        <CardContent className="py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            How to read this report
          </p>
          <ol className="mt-3 flex flex-wrap items-stretch gap-2">
            {steps.map((s, i) => (
              <li key={s.n} className="flex min-w-0 items-center gap-2">
                <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    {s.n}
                  </span>
                  <span className="leading-tight">
                    <span className="block text-xs font-semibold">{s.label}</span>
                    <span className="block text-[11px] text-muted-foreground">{s.detail}</span>
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* HERO: Score + risk — strongest visual elements */}
      <Card className="overflow-hidden border-2">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col items-center justify-center gap-3 bg-muted/40 px-6 py-8 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Compliance score
            </p>
            <ScoreGauge score={run.complianceScore ?? null} size={180} strokeWidth={16} />
            <div className="flex scale-110 flex-wrap items-center justify-center gap-2">
              <RiskBadge level={(run.riskLevel as RiskLevelT | null) ?? null} />
              <DecisionBadge
                status={((run.decisionStatus as DecisionStatusT) ?? DecisionStatus.PENDING)}
              />
            </div>
            <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Verified {formatDateTime(run.startedAt)} · extraction: {run.extractionMode ?? "seeded"}
            </p>
          </div>
          <div className="px-6 py-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              At a glance — what drives the score
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Pass", count: passCount, Icon: CheckCircle2, cls: "border-success/40 bg-success/10 text-success" },
                { label: "Fail", count: failCount, Icon: XCircle, cls: "border-destructive/40 bg-destructive/10 text-destructive" },
                { label: "Warning", count: warnCount, Icon: AlertTriangle, cls: "border-warning/40 bg-warning/10 text-warning" },
                { label: "Pending", count: pendCount, Icon: Clock, cls: "border-border bg-muted/50 text-muted-foreground" },
              ].map((s) => (
                <div key={s.label} className={`rounded-md border px-3 py-2 text-center ${s.cls}`}>
                  <s.Icon className="mx-auto h-4 w-4" aria-hidden />
                  <p className="mt-1 text-2xl font-bold tabular-nums">{s.count}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-muted-foreground">Government records:</span>
                <strong>
                  {verifiedProviders} of {run.providerResults.length} verified
                </strong>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">Discrepancies:</span>
                <strong className={run.discrepancies.length > 0 ? "text-destructive" : "text-success"}>
                  {run.discrepancies.length} flagged
                </strong>
              </p>
              <p className="leading-relaxed text-muted-foreground">{run.summary ?? "—"}</p>
            </div>
          </div>
        </div>
      </Card>

      {isForcedCritical && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Risk elevated to CRITICAL by a hard disqualifier.</p>
            <p className="text-destructive/90">
              A CRITICAL-severity check failed (e.g. active debarment/blacklisting), which
              overrides the numeric score of {run.complianceScore}. Review the failed
              checks below.
            </p>
          </div>
        </div>
      )}

      {/* Score breakdown — plain language */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Score breakdown — where the points come from</CardTitle>
          <CardDescription>
            PASS = full points · WARNING = partial (60%) · PENDING = 40% · FAIL = 0.
            A category with no applicable rules is dropped and its weight redistributed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {CATEGORY_ORDER.map((cat) => {
            const b = breakdownByCat.get(cat);
            const ratio = b?.ratio ?? null;
            const list = resultsByCat.get(cat) ?? [];
            const cp = list.filter((r) => r.result === ComplianceResult.PASS).length;
            const cf = list.filter((r) => r.result === ComplianceResult.FAIL).length;
            const cw = list.filter((r) => r.result === ComplianceResult.WARNING).length;
            return (
              <div key={cat} className="rounded-md border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="font-semibold">
                    {CATEGORY_LABEL[cat]}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {CATEGORY_HINT[cat]}
                    </span>
                  </span>
                  <span className="tabular-nums text-sm">
                    {ratio === null ? (
                      <span className="text-muted-foreground">N/A — no applicable rules</span>
                    ) : (
                      <>
                        <strong>{(b?.points ?? 0).toFixed(1)} pts</strong>
                        <span className="text-muted-foreground">
                          {" "}
                          · {pct(ratio)} of category · {cp} pass · {cw} warning · {cf} fail
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <Progress
                  value={ratio === null ? 0 : ratio * 100}
                  indicatorClassName={ratioTint(ratio)}
                  className="mt-2 h-2.5"
                />
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Total = sum of category points, rounded to {run.complianceScore ?? "—"} / 100.
          </p>
        </CardContent>
      </Card>

      {/* AI summary + recommendation — clearly advisory */}
      <Card className="border-warning/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-warning" />
            AI recommendation
            <Badge variant="outline" className="ml-1 text-[10px] uppercase tracking-wide">
              Advisory only — not a decision
            </Badge>
          </CardTitle>
          <CardDescription>
            Generated from the deterministic engine output. The Procurement Officer makes the
            final QUALIFY / REJECT decision below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="leading-relaxed text-muted-foreground">{run.summary ?? "—"}</p>
          {run.recommendation && (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                AI suggests (officer must confirm)
              </p>
              <p className="mt-1 font-medium">{run.recommendation}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tender requirements with mapped PASS / FAIL / WARNING / PENDING */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Tender requirements ({requirements.length})
          </CardTitle>
          <CardDescription>
            Each requirement&apos;s status is derived from its deterministic rule
            check(s) — the AI does not decide PASS / FAIL.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {requirements.map((req) => {
            const { status, linked, note } = requirementStatus(
              req.code,
              run.ruleResults,
              run.providerResults,
            );
            return (
              <div key={req.id} className={`rounded-md border p-3 ${resultRowTint(status)}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{req.title}</p>
                    <p className="font-mono text-xs text-muted-foreground">{req.code}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant={req.mandatory ? "default" : "secondary"} className="text-[10px]">
                        {req.mandatory ? "MANDATORY" : "OPTIONAL"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">{req.category}</Badge>
                    </div>
                  </div>
                  <ResultBadge result={status} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{req.description}</p>
                {note && <p className="mt-1 text-xs italic text-muted-foreground">{note}</p>}
                {linked.map((r) => (
                  <div key={r.id} className="mt-2 rounded border bg-background/80 p-2">
                    <p className="text-xs font-medium">
                      Decided by: {r.ruleTitle}{" "}
                      <span className="font-mono text-muted-foreground">({r.ruleCode})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{r.detail}</p>
                    <Evidence value={r.evidence} />
                  </div>
                ))}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Compliance checks — source, value, status, time, evidence */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-primary" />
            Compliance checks ({run.ruleResults.length})
          </CardTitle>
          <CardDescription>
            Each check is evaluated deterministically in code — the AI does not decide
            PASS / FAIL. Source, checked value, result, verification time and evidence are
            shown per check.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {CATEGORY_ORDER.map((cat) => {
            const list = resultsByCat.get(cat);
            if (!list || list.length === 0) return null;
            return (
              <div key={cat} className="space-y-2">
                <h3 className="text-sm font-semibold">{CATEGORY_LABEL[cat]}</h3>
                <div className="space-y-2">
                  {list.map((rr) => {
                    const govSource = RULE_SOURCE_MAP[rr.ruleCode];
                    const verifiedAt = govSource
                      ? verifiedAtFor(govSource, run.auditEvents, run.startedAt)
                      : run.startedAt;
                    const evidenceRecord =
                      rr.evidence && typeof rr.evidence === "object"
                        ? (rr.evidence as Record<string, unknown>)
                        : null;
                    const valueEntries = evidenceRecord
                      ? Object.entries(evidenceRecord).slice(0, 4)
                      : [];
                    return (
                      <div key={rr.id} className={`rounded-md border p-3 ${resultRowTint(rr.result)}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">
                              {rr.ruleTitle}{" "}
                              <span className="font-mono text-xs text-muted-foreground">({rr.ruleCode})</span>
                            </p>
                            <p className="mt-0.5 text-sm text-muted-foreground">{rr.detail}</p>
                          </div>
                          <ResultBadge result={rr.result as ComplianceResultT} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Database className="h-3.5 w-3.5" />
                            Source:{" "}
                            <strong className="text-foreground">
                              {govSource ? humanizeGovSource(govSource) : "Bidder documents"}
                            </strong>
                          </span>
                          {valueEntries.length > 0 && (
                            <span>
                              Checked value:{" "}
                              <strong className="font-mono text-foreground">
                                {valueEntries.map(([k, v]) => `${k}=${formatScalar(v)}`).join(" · ")}
                              </strong>
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            Verified: {formatDateTime(verifiedAt)}
                          </span>
                        </div>
                        <Evidence value={rr.evidence} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Government source checks — human readable */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Landmark className="h-4 w-4 text-primary" />
            Government verification results ({run.providerResults.length})
          </CardTitle>
          <CardDescription>
            Authoritative-record lookups across statutory registries.{" "}
            <span className="font-medium text-warning">
              These are mock providers reading seeded demo data — not live government
              integrations.
            </span>{" "}
            Each is a drop-in point for a real authorized API. The table shows what was
            checked and what the registry returned; the full payload stays behind
            “View raw evidence”.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {run.providerResults.map((p) => {
            const rows = payloadRows(p.source, p.payload);
            const verifiedAt = verifiedAtFor(p.source, run.auditEvents, run.startedAt);
            return (
              <div key={p.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{humanizeGovSource(p.source)}</p>
                    <p className="font-mono text-xs text-muted-foreground">{p.source}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ProviderStatusBadge status={p.status as ProviderStatusT} />
                    {p.isMock && (
                      <Badge variant="outline" className="text-[10px]">MOCK</Badge>
                    )}
                  </div>
                </div>
                {rows.length > 0 ? (
                  <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                    {rows.map((r) => (
                      <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-dashed py-1">
                        <dt className="text-xs text-muted-foreground">{r.label}</dt>
                        <dd className="text-right font-mono text-xs font-medium">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="mt-2 text-xs italic text-muted-foreground">
                    No registry record returned for the supplied identifiers.
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Match confidence:{" "}
                    <strong className={`tabular-nums ${confidenceTone(typeof p.confidence === "number" ? p.confidence : 0)}`}>
                      {typeof p.confidence === "number" ? pct(p.confidence) : "—"}
                    </strong>
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Verified: {formatDateTime(verifiedAt)}
                  </span>
                </div>
                <Evidence value={p.payload} label="View raw evidence" />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Discrepancies — visually prominent, side-by-side values */}
      <Card className={run.discrepancies.length > 0 ? "border-destructive/50" : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompareArrows className="h-4 w-4 text-destructive" />
            Detected discrepancies ({run.discrepancies.length})
            {run.discrepancies.length > 0 && (
              <Badge variant="destructive" className="ml-1 text-[10px] uppercase">
                Needs officer review
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Conflicts detected between declared data, documents, and government records.
            Each card shows the two sides and the conflicting values.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {run.discrepancies.length === 0 ? (
            <p className="flex items-center justify-center gap-2 py-4 text-center text-sm text-success">
              <CheckCircle2 className="h-4 w-4" />
              No cross-source discrepancies detected.
            </p>
          ) : (
            <ul className="space-y-3">
              {run.discrepancies.map((d) => {
                const sources = normalizeSources(d.sources);
                const values = extractConflictingValues(d.description);
                const [sideA, sideB] = [sources[0], sources.slice(1).join(" / ") || undefined];
                return (
                  <li key={d.id} className={`rounded-md border-2 p-3 ${severityTint(d.severity)}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                        <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
                        {d.kind.replace(/_/g, " ")}
                      </span>
                      <SeverityBadge severity={d.severity as SeverityT} />
                    </div>
                    <p className="mt-1 text-sm">{d.description}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <div className="rounded border bg-background/80 p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Side A · {sideA ?? "Declared"}
                        </p>
                        <p className="mt-0.5 font-mono text-xs font-medium">
                          {values[0] ?? sideA ?? "—"}
                        </p>
                      </div>
                      <div className="rounded border bg-background/80 p-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Side B · {sideB ?? "Government record"}
                        </p>
                        <p className="mt-0.5 font-mono text-xs font-medium">
                          {values[1] ?? values[0] ?? sideB ?? "—"}
                        </p>
                      </div>
                    </div>
                    {sources.length > 0 && (
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Sources compared: {sources.join("  vs  ")}
                      </p>
                    )}
                    <Evidence value={d.sources} label="View raw evidence" />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* AI findings — linked to document + requirement, with confidence */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSearch className="h-4 w-4 text-primary" />
            AI findings — what was extracted ({run.findings.length})
          </CardTitle>
          <CardDescription>
            Step 1 of the pipeline: facts and observations extracted from submitted
            documents. These feed the deterministic rules; they are not compliance
            decisions. Each finding names its source document, the affected
            requirement where known, and the extraction confidence.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {run.findings.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No findings raised during extraction.
            </p>
          ) : (
            <ul className="space-y-3">
              {run.findings.map((f) => {
                const evidenceRecord =
                  f.evidence && typeof f.evidence === "object"
                    ? (f.evidence as Record<string, unknown>)
                    : null;
                const docName =
                  f.affectedRequirement ??
                  (evidenceRecord?.document !== null && evidenceRecord?.document !== undefined
                    ? String(evidenceRecord.document)
                    : null);
                return (
                  <li
                    key={f.id}
                    className="rounded-md border p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 text-sm">{f.finding}</p>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <SeverityBadge severity={f.severity as SeverityT} />
                        <span className={`text-xs font-semibold tabular-nums ${confidenceTone(f.confidence)}`}>
                          {pct(f.confidence)} confidence
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant="secondary" className="gap-1 text-[11px]">
                        <Database className="h-3 w-3" />
                        {f.source}
                      </Badge>
                      {docName && (
                        <Badge variant="outline" className="gap-1 text-[11px]">
                          <FileText className="h-3 w-3" />
                          {humanizeDocType(docName) !== docName.toLowerCase() ? humanizeDocType(docName) : docName}
                        </Badge>
                      )}
                      {evidenceRecord?.code !== undefined && evidenceRecord?.code !== null && (
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {String(evidenceRecord.code)}
                        </Badge>
                      )}
                    </div>
                    <Progress value={Math.max(0, Math.min(1, f.confidence)) * 100} className="mt-2 h-1.5" />
                    <Evidence
                      value={f.evidence ?? { source: f.source, document: f.affectedRequirement }}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Officer decision — FINAL, visually separate from AI recommendation */}
      <Card className="border-2 border-primary/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scale className="h-4 w-4 text-primary" />
            Officer decision — qualify / reject
            <Badge variant="default" className="ml-1 text-[10px] uppercase tracking-wide">
              Final · Procurement Officer only
            </Badge>
          </CardTitle>
          <CardDescription>
            This is the binding decision. It is recorded to the audit trail under your name
            and is independent of the AI recommendation above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DecisionPanel
            runId={run.id}
            current={(run.decisionStatus as DecisionStatusT) ?? DecisionStatus.PENDING}
            officerName={officerName}
          />
        </CardContent>
      </Card>

      {/* Audit trail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit trail</CardTitle>
          <CardDescription>Append-only log of every step in this verification.</CardDescription>
        </CardHeader>
        <CardContent>
          <AuditTrail events={run.auditEvents} />
        </CardContent>
      </Card>
    </div>
  );
}
