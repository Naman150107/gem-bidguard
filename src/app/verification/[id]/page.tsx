import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { VerificationReport } from "@/components/app/verification-report";
import { RiskBadge, DecisionBadge } from "@/components/app/status";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getRunById } from "@/lib/queries";
import { getCurrentOfficer } from "@/lib/officer";
import { formatDateTime } from "@/lib/utils";
import { RunStatus, DecisionStatus, type DecisionStatus as DecisionStatusT, type RiskLevel as RiskLevelT } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function VerificationReportPage({
  params,
}: {
  params: { id: string };
}) {
  const run = await getRunById(params.id);
  if (!run) notFound();

  const officer = getCurrentOfficer();
  const completed = run.status === RunStatus.COMPLETED;

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
            {completed && (
              <span className="inline-flex items-center gap-1.5 text-sm">
                <span className="font-bold tabular-nums">Score {run.complianceScore ?? "—"}/100</span>
                <RiskBadge level={(run.riskLevel as RiskLevelT | null) ?? null} />
                <DecisionBadge
                  status={((run.decisionStatus as DecisionStatusT) ?? DecisionStatus.PENDING)}
                />
              </span>
            )}
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
        <VerificationReport
          run={run}
          requirements={run.tender.requirements}
          officerName={officer.name}
        />
      )}
    </div>
  );
}
