import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  ShieldAlert,
  Landmark,
  FileSearch,
  GitCompareArrows,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ScoreGauge } from "@/components/app/score-gauge";
import {
  RiskBadge,
  ResultBadge,
  SeverityBadge,
  ProviderStatusBadge,
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
import { buttonVariants } from "@/components/ui/button";
import { getRunById } from "@/lib/queries";
import { getCurrentOfficer } from "@/lib/officer";
import { formatDateTime, pct } from "@/lib/utils";
import { humanizeGovSource } from "@/lib/doc-labels";
import {
  RunStatus,
  WeightCategory,
  ComplianceResult,
  type WeightCategory as WeightCategoryT,
  type ComplianceResult as ComplianceResultT,
  type RiskLevel as RiskLevelT,
  type Severity as SeverityT,
  type ProviderStatus as ProviderStatusT,
  type DecisionStatus as DecisionStatusT,
  DecisionStatus,
} from "@/lib/types";

export const dynamic = "force-dynamic";

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

export default async function VerificationReportPage({
  params,
}: {
  params: { id: string };
}) {
  const run = await getRunById(params.id);
  if (!run) notFound();

  const officer = getCurrentOfficer();
  const completed = run.status === RunStatus.COMPLETED;

  const breakdown = (run.scoreBreakdown as unknown as BreakdownRow[] | null) ?? [];
  const breakdownByCat = new Map(breakdown.map((b) => [b.category, b]));

  // Group rule results by weight category for display.
  const resultsByCat = new Map<WeightCategoryT, typeof run.ruleResults>();
  for (const rr of run.ruleResults) {
    const cat = rr.category as WeightCategoryT;
    const list = resultsByCat.get(cat) ?? [];
    list.push(rr);
    resultsByCat.set(cat, list);
  }

  // The CRITICAL-fail gate can force CRITICAL even when the numeric score would
  // land in a lower band; surface a banner in that case.
  const isForcedCritical =
    run.riskLevel === "CRITICAL" &&
    typeof run.complianceScore === "number" &&
    run.complianceScore >= 50;

  return (
    <div className="space-y-6">
      <Link
        href={`/bidders/${run.bidderId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to bidder
      </Link>

      <PageHeader
        title={`Verification report — ${run.bidder.name}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {run.tender.title}
            </span>
            <span className="text-xs">
              Run {formatDateTime(run.startedAt)} · extraction:{" "}
              {run.extractionMode ?? "seeded"}
            </span>
          </span>
        }
      />

      {!completed ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            This run is <Badge variant="secondary">{run.status}</Badge>. No
            report is available.
          </CardContent>
        </Card>
      ) : (
        <>
          <DisclaimerBanner />

          {/* Score + breakdown */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-base">Compliance score</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center gap-3">
                <ScoreGauge score={run.complianceScore} />
                <RiskBadge level={run.riskLevel as RiskLevelT} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Score breakdown</CardTitle>
                <CardDescription>
                  Weighted across four categories. A category with no applicable
                  rules is dropped and its weight redistributed.
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
                          {ratio === null
                            ? "N/A"
                            : `${pct(ratio)} · ${b?.ruleCount ?? 0} rule(s)`}
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
                <p className="font-medium">
                  Risk elevated to CRITICAL by a hard disqualifier.
                </p>
                <p className="text-destructive/90">
                  A CRITICAL-severity check failed (e.g. active
                  debarment/blacklisting), which overrides the numeric score of{" "}
                  {run.complianceScore}. Review the failed checks below.
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
                Generated from the deterministic engine output. Decision-support
                only.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="leading-relaxed text-muted-foreground">
                {run.summary}
              </p>
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

          {/* Compliance checks grouped by category */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Compliance checks</CardTitle>
              <CardDescription>
                Each check is evaluated deterministically in code — the AI does
                not decide PASS / FAIL.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {CATEGORY_ORDER.map((cat) => {
                const list = resultsByCat.get(cat);
                if (!list || list.length === 0) return null;
                return (
                  <div key={cat} className="space-y-2">
                    <h3 className="text-sm font-semibold">
                      {CATEGORY_LABEL[cat]}
                    </h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[160px]">Rule</TableHead>
                          <TableHead>Detail</TableHead>
                          <TableHead className="w-[110px] text-right">
                            Result
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((rr) => (
                          <TableRow key={rr.id}>
                            <TableCell>
                              <div className="font-medium">{rr.ruleTitle}</div>
                              <div className="font-mono text-xs text-muted-foreground">
                                {rr.ruleCode}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {rr.detail}
                            </TableCell>
                            <TableCell className="text-right">
                              <ResultBadge
                                result={rr.result as ComplianceResultT}
                              />
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
                Government source checks ({run.providerResults.length})
              </CardTitle>
              <CardDescription>
                Authoritative-record lookups across statutory registries.{" "}
                <span className="font-medium text-warning">
                  These are mock providers reading seeded demo data — not live
                  government integrations.
                </span>{" "}
                Each is a drop-in point for a real authorized API.
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
                      </TableCell>
                      <TableCell>
                        <ProviderStatusBadge
                          status={p.status as ProviderStatusT}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {typeof p.confidence === "number"
                          ? pct(p.confidence)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {p.isMock && (
                          <Badge variant="outline" className="text-[10px]">
                            MOCK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* AI findings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSearch className="h-4 w-4 text-primary" />
                AI-extracted findings ({run.findings.length})
              </CardTitle>
              <CardDescription>
                Facts and observations extracted from submitted documents. These
                feed the deterministic rules; they are not compliance decisions.
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
                      <div className="space-y-1">
                        <p className="text-sm">{f.finding}</p>
                        {f.affectedRequirement && (
                          <p className="text-xs text-muted-foreground">
                            Source: {f.affectedRequirement}
                          </p>
                        )}
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

          {/* Discrepancies */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <GitCompareArrows className="h-4 w-4 text-primary" />
                Cross-source discrepancies ({run.discrepancies.length})
              </CardTitle>
              <CardDescription>
                Conflicts detected between declared data, documents, and
                government records.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {run.discrepancies.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No cross-source discrepancies detected.
                </p>
              ) : (
                <ul className="space-y-3">
                  {run.discrepancies.map((d) => (
                    <li key={d.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">
                          {d.kind.replace(/_/g, " ")}
                        </span>
                        <SeverityBadge severity={d.severity as SeverityT} />
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {d.description}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Officer decision */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Officer decision</CardTitle>
              <CardDescription>
                The final qualification decision rests with the Procurement
                Officer. This action is recorded to the audit trail.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DecisionPanel
                runId={run.id}
                current={
                  (run.decisionStatus as DecisionStatusT) ??
                  DecisionStatus.PENDING
                }
                officerName={officer.name}
              />
            </CardContent>
          </Card>

          {/* Audit trail */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Audit trail</CardTitle>
              <CardDescription>
                Append-only log of every step in this verification.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AuditTrail events={run.auditEvents} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
