import Link from "next/link";
import {
  Users,
  ShieldCheck,
  CheckCircle2,
  Ban,
  ArrowRight,
  ListChecks,
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { DisclaimerBanner } from "@/components/app/disclaimer";
import { RiskBadge, DecisionBadge, RISK_COLOR } from "@/components/app/status";
import { RiskDistributionChart, type RiskDatum } from "@/components/app/risk-distribution-chart";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { getBiddersWithLatestRun, getRecentAuditEvents } from "@/lib/queries";
import { humanizeAction } from "@/lib/labels";
import { formatDateTime, cn } from "@/lib/utils";
import { riskLevelForScore } from "@/lib/config";
import {
  RunStatus,
  RiskLevel,
  DecisionStatus,
  type RiskLevel as RiskLevelT,
  type DecisionStatus as DecisionStatusT,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [bidders, auditEvents] = await Promise.all([
    getBiddersWithLatestRun(),
    getRecentAuditEvents(6),
  ]);

  const latest = bidders.map((b) => ({ bidder: b, run: b.runs[0] ?? null }));
  const completed = latest.filter(
    (x) => x.run?.status === RunStatus.COMPLETED,
  );

  // --- Aggregates -----------------------------------------------------------
  const totalBidders = bidders.length;
  const verifiedCount = completed.length;
  const qualifiedCount = completed.filter(
    (x) => x.run?.decisionStatus === DecisionStatus.QUALIFIED,
  ).length;
  const rejectedCount = completed.filter(
    (x) => x.run?.decisionStatus === DecisionStatus.REJECTED,
  ).length;
  const pendingDecisionCount = completed.filter(
    (x) => x.run?.decisionStatus === DecisionStatus.PENDING,
  ).length;

  const riskCounts: Record<RiskLevelT, number> = {
    [RiskLevel.LOW]: 0,
    [RiskLevel.MODERATE]: 0,
    [RiskLevel.HIGH]: 0,
    [RiskLevel.CRITICAL]: 0,
  };
  for (const { run } of completed) {
    const lvl = run?.riskLevel as RiskLevelT | null;
    if (lvl && lvl in riskCounts) riskCounts[lvl] += 1;
  }
  const notVerified = totalBidders - verifiedCount;

  const chartData: RiskDatum[] = [
    { name: "Low", value: riskCounts.LOW, color: RISK_COLOR.LOW },
    { name: "Moderate", value: riskCounts.MODERATE, color: RISK_COLOR.MODERATE },
    { name: "High", value: riskCounts.HIGH, color: RISK_COLOR.HIGH },
    { name: "Critical", value: riskCounts.CRITICAL, color: RISK_COLOR.CRITICAL },
    { name: "Not verified", value: notVerified, color: "#94a3b8" },
  ];

  const stats = [
    {
      label: "Bidders",
      value: totalBidders,
      sub: "under evaluation",
      Icon: Users,
      tint: "text-primary",
    },
    {
      label: "Verified",
      value: verifiedCount,
      sub: `${notVerified} pending`,
      Icon: ShieldCheck,
      tint: "text-primary",
    },
    {
      label: "Qualified",
      value: qualifiedCount,
      sub: "by officer",
      Icon: CheckCircle2,
      tint: "text-success",
    },
    {
      label: "Rejected",
      value: rejectedCount,
      sub: `${pendingDecisionCount} awaiting decision`,
      Icon: Ban,
      tint: "text-destructive",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance Dashboard"
        description="Decision-support overview of bidder verification for the active GeM tender. Scores and risk bands are computed by deterministic rules; qualification decisions rest with the Procurement Officer."
        actions={
          <Link
            href="/tenders"
            className={buttonVariants({ variant: "default", size: "default" })}
          >
            View tenders
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      <DisclaimerBanner compact />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex items-center justify-between gap-3 p-5">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-3xl font-bold tabular-nums">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.sub}</p>
              </div>
              <s.Icon className={cn("h-8 w-8 shrink-0", s.tint)} />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Risk distribution + recent activity */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Risk distribution</CardTitle>
            <CardDescription>
              Bidders grouped by computed risk band.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RiskDistributionChart data={chartData} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              Latest entries from the verification audit trail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {auditEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <ListChecks className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No verifications have been run yet.
                </p>
                <p className="text-xs text-muted-foreground">
                  Run{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    npm run demo:verify
                  </code>{" "}
                  or start a verification from a bidder page.
                </p>
              </div>
            ) : (
              <ul className="divide-y">
                {auditEvents.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 py-2.5">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {humanizeAction(e.action)}
                        {(e.source || e.rule) && (
                          <span className="font-normal text-muted-foreground">
                            {" · "}
                            {e.source ?? e.rule}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {e.result ? `${e.result} — ` : ""}
                        {formatDateTime(e.timestamp)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bidders table */}
      <Card>
        <CardHeader>
          <CardTitle>Bidders</CardTitle>
          <CardDescription>
            Latest verification result per bidder. Open a bidder to review
            findings and record a decision.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bidder</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {latest.map(({ bidder, run }) => {
                const isDone = run?.status === RunStatus.COMPLETED;
                const score =
                  isDone && typeof run?.complianceScore === "number"
                    ? run.complianceScore
                    : null;
                const level = score !== null ? riskLevelForScore(score) : null;
                return (
                  <TableRow key={bidder.id}>
                    <TableCell>
                      <div className="font-medium">{bidder.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {bidder.tender?.referenceNo ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {score !== null ? (
                        <span
                          className="text-base font-bold tabular-nums"
                          style={{ color: level ? RISK_COLOR[level] : undefined }}
                        >
                          {score}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <RiskBadge level={level} />
                    </TableCell>
                    <TableCell>
                      <DecisionBadge
                        status={
                          (run?.decisionStatus as DecisionStatusT) ??
                          DecisionStatus.PENDING
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/bidders/${bidder.id}`}
                        className={buttonVariants({
                          variant: "outline",
                          size: "sm",
                        })}
                      >
                        Review
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
