import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import {
  RiskBadge,
  DecisionBadge,
  SeverityBadge,
  RISK_COLOR,
} from "@/components/app/status";
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
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getTenderById } from "@/lib/queries";
import { formatINR, formatDate } from "@/lib/utils";
import { riskLevelForScore } from "@/lib/config";
import {
  RunStatus,
  WeightCategory,
  type WeightCategory as WeightCategoryT,
  type Severity as SeverityT,
  type RiskLevel as RiskLevelT,
  type DecisionStatus as DecisionStatusT,
  DecisionStatus,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const WEIGHT_VARIANT: Record<WeightCategoryT, NonNullable<BadgeProps["variant"]>> = {
  [WeightCategory.MANDATORY]: "default",
  [WeightCategory.STATUTORY]: "secondary",
  [WeightCategory.DOCUMENT]: "outline",
  [WeightCategory.CONSISTENCY]: "outline",
};

function formatConfig(config: unknown): string {
  if (!config || typeof config !== "object") return "—";
  const entries = Object.entries(config as Record<string, unknown>);
  if (entries.length === 0) return "—";
  return entries
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.length : String(v)}`)
    .join(", ");
}

export default async function TenderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const tender = await getTenderById(params.id);
  if (!tender) notFound();

  const meta: { label: string; value: React.ReactNode }[] = [
    { label: "Reference", value: tender.referenceNo },
    { label: "Ministry / Buyer", value: tender.ministry },
    { label: "Category", value: tender.category },
    { label: "Estimated value", value: formatINR(tender.estimatedValue) },
    { label: "Bid deadline", value: formatDate(tender.bidSubmissionDeadline) },
    { label: "Bidders", value: tender.bidders.length },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/tenders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All tenders
      </Link>

      <PageHeader
        title={tender.title}
        description={
          <span className="inline-flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            {tender.referenceNo}
          </span>
        }
      />

      {/* Summary */}
      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
          {meta.map((m) => (
            <div key={m.label} className="space-y-0.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {m.label}
              </p>
              <p className="text-sm font-medium">{m.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {tender.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Scope</CardTitle>
          </CardHeader>
          <CardContent className="whitespace-pre-line text-sm text-muted-foreground">
            {tender.description}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="requirements">
        <TabsList>
          <TabsTrigger value="requirements">
            Requirements ({tender.requirements.length})
          </TabsTrigger>
          <TabsTrigger value="rules">
            Compliance rules ({tender.rules.length})
          </TabsTrigger>
          <TabsTrigger value="bidders">
            Bidders ({tender.bidders.length})
          </TabsTrigger>
        </TabsList>

        {/* Requirements */}
        <TabsContent value="requirements">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Eligibility requirements</CardTitle>
              <CardDescription>
                Conditions a bid must meet to qualify. Mandatory requirements
                carry the highest weight in scoring.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[130px]">Code</TableHead>
                    <TableHead>Requirement</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tender.requirements.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.code}</TableCell>
                      <TableCell>
                        <div className="font-medium">{r.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.description}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{r.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {r.mandatory ? (
                          <Badge variant="default">Mandatory</Badge>
                        ) : (
                          <Badge variant="outline">Optional</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rules */}
        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Deterministic compliance rules</CardTitle>
              <CardDescription>
                Rules are evaluated in code — not by the AI — to produce
                PASS / FAIL / WARNING outcomes. Weight category and failure
                severity drive the risk score.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Code</TableHead>
                    <TableHead>Rule</TableHead>
                    <TableHead>Weight</TableHead>
                    <TableHead>On fail</TableHead>
                    <TableHead>Parameters</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tender.rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-mono text-xs">
                        {rule.code}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{rule.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {rule.description}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            WEIGHT_VARIANT[rule.weightCategory as WeightCategoryT] ??
                            "outline"
                          }
                        >
                          {rule.weightCategory}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <SeverityBadge severity={rule.severityOnFail as SeverityT} />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatConfig(rule.config)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bidders */}
        <TabsContent value="bidders">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Participating bidders</CardTitle>
              <CardDescription>
                Latest verification outcome per bidder. Open a bidder to review
                findings and record a qualification decision.
              </CardDescription>
            </CardHeader>
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
                  {tender.bidders.map((bidder) => {
                    const run = bidder.runs[0] ?? null;
                    const isDone = run?.status === RunStatus.COMPLETED;
                    const score =
                      isDone && typeof run?.complianceScore === "number"
                        ? run.complianceScore
                        : null;
                    const level =
                      score !== null ? riskLevelForScore(score) : null;
                    return (
                      <TableRow key={bidder.id}>
                        <TableCell>
                          <div className="font-medium">{bidder.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {bidder.legalName}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {score !== null ? (
                            <span
                              className="text-base font-bold tabular-nums"
                              style={{
                                color: level ? RISK_COLOR[level] : undefined,
                              }}
                            >
                              {score}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <RiskBadge level={level as RiskLevelT | null} />
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
