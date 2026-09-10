import {
  ShieldAlert,
  Landmark,
  FileSearch,
  GitCompareArrows,
  Sparkles,
  ClipboardCheck,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { humanizeGovSource } from "@/lib/doc-labels";
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
  if (sources && typeof sources === "object") return Object.values(sources as Record<string, unknown>).map((v) => String(v));
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

function Evidence({ value, label = "View evidence / source" }: { value: unknown; label?: string }) {
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

/**
 * Full demo-ready verification report. Rendered inline on /bidders/[id] for
 * the latest run and reused by /verification/[id]. Pure presentation over the
 * existing backend output — no engine logic duplicated here.
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

  return (
    <div className="space-y-6">
      <DisclaimerBanner />

      {/* Score + breakdown */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Compliance score</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <ScoreGauge score={run.complianceScore ?? null} />
            <div className="flex flex-wrap items-center justify-center gap-2">
              <RiskBadge level={(run.riskLevel as RiskLevelT | null) ?? null} />
              <DecisionBadge
                status={((run.decisionStatus as DecisionStatusT) ?? DecisionStatus.PENDING)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Run {formatDateTime(run.startedAt)} · extraction: {run.extractionMode ?? "seeded"}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Score breakdown</CardTitle>
            <CardDescription>
              Weighted across four categories. A category with no applicable rules is
              dropped and its weight redistributed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {CATEGORY_ORDER.map((cat) => {
              const b = breakdownByCat.get(cat);
              const ratio = b?.ratio ?? null;
              return (
                <div key={cat} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">
                      {CATEGORY_LABEL[cat]}
                      <span className="ml-2 text-xs text-muted-foreground">
                        weight {pct(b?.weight ?? 0)}
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {ratio === null ? "N/A" : `${pct(ratio)} · ${b?.ruleCount ?? 0} rule(s)`}
                    </span>
                  </div>
                  <Progress
                    value={ratio === null ? 0 : ratio * 100}
                    indicatorClassName={ratioTint(ratio)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

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

      {/* AI summary + recommendation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            AI summary &amp; recommendation
          </CardTitle>
          <CardDescription>
            Generated from the deterministic engine output. Decision-support only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="leading-relaxed text-muted-foreground">{run.summary ?? "—"}</p>
          {run.recommendation && (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recommendation
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
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[220px]">Requirement</TableHead>
                <TableHead>Detail / evidence</TableHead>
                <TableHead className="w-[120px] text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requirements.map((req) => {
                const { status, linked, note } = requirementStatus(
                  req.code,
                  run.ruleResults,
                  run.providerResults,
                );
                return (
                  <TableRow key={req.id}>
                    <TableCell>
                      <div className="font-medium">{req.title}</div>
                      <div className="font-mono text-xs text-muted-foreground">{req.code}</div>
                      <div className="mt-1 flex gap-1">
                        <Badge variant={req.mandatory ? "default" : "secondary"} className="text-[10px]">
                          {req.mandatory ? "MANDATORY" : "OPTIONAL"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{req.category}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <p>{req.description}</p>
                      {note && <p className="mt-1 text-xs italic">{note}</p>}
                      {linked.map((r) => (
                        <div key={r.id} className="mt-1.5 rounded border bg-muted/30 p-2">
                          <p className="text-xs font-medium text-foreground">
                            {r.ruleTitle} <span className="font-mono text-muted-foreground">({r.ruleCode})</span>
                          </p>
                          <p className="text-xs">{r.detail}</p>
                          <Evidence value={r.evidence} />
                        </div>
                      ))}
                    </TableCell>
                    <TableCell className="text-right">
                      <ResultBadge result={status} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Compliance checks grouped by category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compliance checks</CardTitle>
          <CardDescription>
            Each check is evaluated deterministically in code — the AI does not decide
            PASS / FAIL. Evidence is shown per check.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {CATEGORY_ORDER.map((cat) => {
            const list = resultsByCat.get(cat);
            if (!list || list.length === 0) return null;
            return (
              <div key={cat} className="space-y-2">
                <h3 className="text-sm font-semibold">{CATEGORY_LABEL[cat]}</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">Rule</TableHead>
                      <TableHead>Detail + evidence</TableHead>
                      <TableHead className="w-[110px] text-right">Result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((rr) => (
                      <TableRow key={rr.id}>
                        <TableCell>
                          <div className="font-medium">{rr.ruleTitle}</div>
                          <div className="font-mono text-xs text-muted-foreground">{rr.ruleCode}</div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {rr.detail}
                          <Evidence value={rr.evidence} />
                        </TableCell>
                        <TableCell className="text-right">
                          <ResultBadge result={rr.result as ComplianceResultT} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Government source checks */}
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
            Each is a drop-in point for a real authorized API. Payload is the supporting
            source record.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Confidence</TableHead>
                <TableHead className="w-[90px] text-right">Mode</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {run.providerResults.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {humanizeGovSource(p.source)}
                    <Evidence value={p.payload} label="View source record" />
                  </TableCell>
                  <TableCell>
                    <ProviderStatusBadge status={p.status as ProviderStatusT} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {typeof p.confidence === "number" ? pct(p.confidence) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {p.isMock && (
                      <Badge variant="outline" className="text-[10px]">MOCK</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Discrepancies */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitCompareArrows className="h-4 w-4 text-primary" />
            Detected discrepancies ({run.discrepancies.length})
          </CardTitle>
          <CardDescription>
            Conflicts detected between declared data, documents, and government records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {run.discrepancies.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No cross-source discrepancies detected.
            </p>
          ) : (
            <ul className="space-y-3">
              {run.discrepancies.map((d) => {
                const sources = normalizeSources(d.sources);
                return (
                  <li key={d.id} className="rounded-md border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{d.kind.replace(/_/g, " ")}</span>
                      <SeverityBadge severity={d.severity as SeverityT} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{d.description}</p>
                    {sources.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sources: {sources.join(" vs ")}
                      </p>
                    )}
                    <Evidence value={d.sources} label="View conflicting values" />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* AI findings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSearch className="h-4 w-4 text-primary" />
            AI findings ({run.findings.length})
          </CardTitle>
          <CardDescription>
            Facts and observations extracted from submitted documents. These feed the
            deterministic rules; they are not compliance decisions. Confidence and
            source are shown per finding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {run.findings.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No findings raised during extraction.
            </p>
          ) : (
            <ul className="space-y-3">
              {run.findings.map((f) => (
                <li
                  key={f.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-sm">{f.finding}</p>
                    <p className="text-xs text-muted-foreground">
                      Source: {f.source}
                      {f.affectedRequirement ? ` · Document: ${f.affectedRequirement}` : ""}
                    </p>
                    <Evidence value={f.evidence ?? { source: f.source, document: f.affectedRequirement }} />
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <SeverityBadge severity={f.severity as SeverityT} />
                    <span className="text-xs tabular-nums text-muted-foreground">
                      conf. {pct(f.confidence)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Officer decision */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Officer decision — qualify / reject</CardTitle>
          <CardDescription>
            The final qualification decision rests with the Procurement Officer. This
            action is recorded to the audit trail.
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
