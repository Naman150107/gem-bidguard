import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Building2, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { RunVerificationButton } from "@/components/app/run-verification-button";
import { DocumentUploader } from "@/components/app/document-uploader";
import { ScoreGauge } from "@/components/app/score-gauge";
import { RiskBadge, DecisionBadge } from "@/components/app/status";
import { DisclaimerBanner } from "@/components/app/disclaimer";
import { VerificationReport } from "@/components/app/verification-report";
import {
  BandwidthRadarCard,
  BandwidthRadarUnavailable,
} from "@/components/app/bandwidth-radar";
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
import { buttonVariants } from "@/components/ui/button";
import { getBidderDetail } from "@/lib/queries";
import { getBandwidthAssessment } from "@/server/bandwidth";
import { getCurrentOfficer } from "@/lib/officer";
import { formatDate } from "@/lib/utils";
import { humanizeDocType } from "@/lib/doc-labels";
import { RunStatus, DecisionStatus, type DecisionStatus as DecisionStatusT } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BidderPage({
  params,
}: {
  params: { id: string };
}) {
  const bidder = await getBidderDetail(params.id);
  if (!bidder) notFound();

  const officer = getCurrentOfficer();
  const run = bidder.runs[0] ?? null;
  const completed = run?.status === RunStatus.COMPLETED;
  const score = completed ? run?.complianceScore ?? null : null;

  // Bandwidth Radar (capacity exposure) — deliberately separate from the
  // compliance verification above. Null when no server-side capacity profile
  // exists; the card then renders an explanatory fallback.
  const bandwidth = await getBandwidthAssessment(bidder.id).catch(() => null);

  const identity: { label: string; value: React.ReactNode }[] = [
    { label: "Legal name", value: bidder.legalName },
    { label: "PAN", value: bidder.pan },
    { label: "GSTIN", value: bidder.gstin },
    { label: "CIN", value: bidder.cin ?? "—" },
    { label: "Udyam", value: bidder.udyamNumber ?? "—" },
    { label: "MSME category", value: bidder.msmeCategory ?? "—" },
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/tenders"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <PageHeader
        title={bidder.name}
        description={
          <span className="inline-flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            {bidder.tender.title}
          </span>
        }
        actions={
          <RunVerificationButton bidderId={bidder.id} hasRun={Boolean(run)} />
        }
      />

      {/* Latest run summary */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-2 lg:col-span-1">
          <CardHeader className="pb-0 text-center">
            <CardTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Latest verification · compliance score & risk
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3 py-6">
            {completed && run ? (
              <>
                <ScoreGauge score={score} size={168} strokeWidth={15} />
                <div className="flex scale-110 flex-wrap items-center justify-center gap-2">
                  <RiskBadge level={run.riskLevel as never} />
                  <DecisionBadge
                    status={(run.decisionStatus as DecisionStatusT) ?? DecisionStatus.PENDING}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {run.ruleResults.filter((r) => r.result === "FAIL").length} failed ·{" "}
                  {run.ruleResults.filter((r) => r.result === "WARNING").length} warnings ·{" "}
                  {run.discrepancies.length} discrepanc{run.discrepancies.length === 1 ? "y" : "ies"}
                </p>
                <Link
                  href={`/verification/${run.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Open standalone report
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No verification run yet. Use “Run verification” to generate a
                decision-support report.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Identity & registration</CardTitle>
            <CardDescription>As declared by the bidder.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {identity.map((i) => (
              <div key={i.label} className="space-y-0.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {i.label}
                </p>
                <p className="text-sm font-medium">{i.value}</p>
              </div>
            ))}
            <div className="col-span-2 space-y-0.5 sm:col-span-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Registered address
              </p>
              <p className="text-sm font-medium">{bidder.address}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {completed && run ? (
        <VerificationReport
          run={run}
          requirements={bidder.tender.requirements}
          officerName={officer.name}
        />
      ) : (
        <DisclaimerBanner compact />
      )}

      {/* Bandwidth Radar — capacity exposure (advisory, independent of compliance) */}
      {bandwidth ? (
        <BandwidthRadarCard assessment={bandwidth} bidderId={bidder.id} />
      ) : (
        <BandwidthRadarUnavailable />
      )}

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Submitted documents ({bidder.documents.length})
          </CardTitle>
          <CardDescription>
            Documents on file for this bidder. These feed the AI extraction step;
            extracted fields and confidence below are exactly what verification
            checks (PASS/FAIL stays with the deterministic rules).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b p-4">
            <DocumentUploader bidderId={bidder.id} />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Extraction</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bidder.documents.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-6 text-center text-sm text-muted-foreground"
                  >
                    No documents yet. Use the upload form above to add one.
                  </TableCell>
                </TableRow>
              ) : (
                bidder.documents.map((d) => {
                  const ext =
                    (d.extractedFields as unknown as Record<
                      string,
                      unknown
                    > | null) ?? null;
                  const conf =
                    typeof d.extractionConfidence === "number"
                      ? d.extractionConfidence
                      : null;
                  const pan =
                    typeof ext?.pan === "string" ? (ext.pan as string) : null;
                  const gstin =
                    typeof ext?.gstin === "string"
                      ? (ext.gstin as string)
                      : null;
                  const legalName =
                    typeof ext?.legalName === "string"
                      ? (ext.legalName as string)
                      : null;
                  const labelFields =
                    ext?.fields &&
                    typeof ext.fields === "object" &&
                    ext.fields !== null
                      ? (ext.fields as Record<string, unknown>)
                      : null;
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <span className="inline-flex items-center gap-2 font-medium">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {d.fileName}
                        </span>
                        {(pan ?? gstin ?? legalName) && (
                          <span className="mt-0.5 block font-mono text-[11px] font-normal text-muted-foreground">
                            {[pan, gstin].filter(Boolean).join(" · ")}
                            {legalName ? ` · ${legalName}` : ""}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{humanizeDocType(d.type)}</Badge>
                      </TableCell>
                      <TableCell>
                        {conf === null ? (
                          <span className="text-xs text-muted-foreground">
                            Not yet extracted — run verification.
                          </span>
                        ) : (
                          <span className="text-xs">
                            <span
                              className={
                                conf >= 0.9
                                  ? "font-semibold text-success"
                                  : conf >= 0.7
                                    ? "font-semibold text-warning"
                                    : "font-semibold text-destructive"
                              }
                            >
                              {Math.round(conf * 100)}%
                            </span>{" "}
                            <span className="text-muted-foreground">
                              {conf < 0.7
                                ? "needs manual review"
                                : "confidence"}
                            </span>
                            {labelFields && (
                              <details className="mt-0.5">
                                <summary className="cursor-pointer text-muted-foreground underline-offset-2 hover:underline">
                                  View fields (
                                  {Object.keys(labelFields).length})
                                </summary>
                                <pre className="mt-1 max-h-40 w-64 overflow-auto rounded border bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
                                  {JSON.stringify(ext ?? {}, null, 2)}
                                </pre>
                              </details>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(d.issueDate)}</TableCell>
                      <TableCell>{formatDate(d.expiryDate)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
