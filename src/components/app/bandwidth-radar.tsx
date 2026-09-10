"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  Eye,
  Loader2,
  OctagonX,
  ShieldCheck,
  TableProperties,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExposureLevel, type ExposureLevel as ExposureLevelT } from "@/lib/types";
import { formatDateTime, formatINR } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Prop shapes (structural subset of the bandwidth service payloads, so this
// client component never imports the server-only service module).
// ---------------------------------------------------------------------------

export interface BandwidthAssessmentProp {
  disclaimer: string;
  dataSourceLabel: string;
  capacity: {
    estimatedCapacity: number;
    turnoverBasis: number;
    workforceBasis: number;
    categoryUsed: string;
    basis: string;
    recommendedExposureThresholdPct: number;
  };
  exposure: {
    exposurePct: number;
    exposureLevel: ExposureLevelT;
    activeContractCount: number;
    activeObligationValue: number;
    estimatedCapacity: number;
    remainingCapacityValue: number;
    remainingCapacityPct: number;
    math: string;
  };
  persisted: {
    assessedAt: Date | string;
  } | null;
}

export interface LedgerAwardLine {
  referenceNo: string;
  title: string;
  category: string;
  procuringOrg: string;
  state: string;
  awardValue: number;
  status: string;
  included: boolean;
  reason: string;
}

interface LedgerResponse {
  disclaimer: string;
  dataSourceLabel: string;
  summary: {
    activeContractCount: number;
    activeObligationValue: number;
    excludedCount: number;
    excludedValue: number;
  };
  activeAwards: LedgerAwardLine[];
  excludedAwards: LedgerAwardLine[];
}

// ---------------------------------------------------------------------------
// Exposure badge (bandwidth-only; deliberately distinct from RiskBadge so
// Compliance Risk and Bandwidth Exposure read as two separate metrics).
// ---------------------------------------------------------------------------

const EXPOSURE_META: Record<
  ExposureLevelT,
  { variant: "success" | "warning" | "destructive"; Icon: typeof Activity }
> = {
  [ExposureLevel.HEALTHY]: { variant: "success", Icon: ShieldCheck },
  [ExposureLevel.WATCH]: { variant: "warning", Icon: Eye },
  [ExposureLevel.HIGH]: { variant: "destructive", Icon: AlertTriangle },
  [ExposureLevel.CRITICAL]: { variant: "destructive", Icon: OctagonX },
};

export function ExposureBadge({ level }: { level: ExposureLevelT }) {
  const meta = EXPOSURE_META[level];
  return (
    <Badge variant={meta.variant} className="gap-1">
      <meta.Icon className="h-3.5 w-3.5" />
      {level}
    </Badge>
  );
}

function exposureBarClass(level: ExposureLevelT): string {
  switch (level) {
    case ExposureLevel.HEALTHY:
      return "bg-success";
    case ExposureLevel.WATCH:
      return "bg-warning";
    case ExposureLevel.HIGH:
    case ExposureLevel.CRITICAL:
      return "bg-destructive";
  }
}

// ---------------------------------------------------------------------------
// Obligation ledger (loaded on demand from the existing ledger API).
// ---------------------------------------------------------------------------

function AwardTable({ awards }: { awards: LedgerAwardLine[] }) {
  if (awards.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No contracts in this group.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Contract</TableHead>
          <TableHead>Procuring org · State</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Why</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {awards.map((a) => (
          <TableRow key={a.referenceNo}>
            <TableCell>
              <span className="font-mono text-xs font-medium">{a.referenceNo}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {a.title}
              </span>
            </TableCell>
            <TableCell className="text-xs">
              {a.procuringOrg}
              <span className="block text-muted-foreground">{a.state}</span>
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatINR(a.awardValue)}
            </TableCell>
            <TableCell>
              <Badge variant={a.included ? "success" : "secondary"}>
                {a.status}
              </Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {a.reason}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ObligationLedger({ bidderId }: { bidderId: string }) {
  const [open, setOpen] = React.useState(false);
  const [ledger, setLedger] = React.useState<LedgerResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (ledger || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/bandwidth/${encodeURIComponent(bidderId)}/ledger`,
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Ledger could not be loaded.");
      }
      setLedger((await res.json()) as LedgerResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ledger could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={toggle} disabled={loading}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <TableProperties className="h-4 w-4" />
        )}
        {loading
          ? "Loading ledger…"
          : open
            ? "Hide Obligation Ledger"
            : "View Obligation Ledger"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {open && ledger && (
        <div className="space-y-3 rounded-md border p-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground">ACTIVE</span>{" "}
            contracts contribute to exposure.{" "}
            <span className="font-semibold text-foreground">
              COMPLETED / CANCELLED
            </span>{" "}
            contracts are excluded from live exposure and listed here for audit
            traceability. ({ledger.dataSourceLabel})
          </p>
          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">
                Active · contributes ({ledger.summary.activeContractCount})
              </TabsTrigger>
              <TabsTrigger value="excluded">
                Excluded · no load ({ledger.summary.excludedCount})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="active">
              <p className="mb-2 text-xs text-muted-foreground">
                Live obligation load:{" "}
                <span className="font-semibold text-foreground">
                  {formatINR(ledger.summary.activeObligationValue)}
                </span>
              </p>
              <AwardTable awards={ledger.activeAwards} />
            </TabsContent>
            <TabsContent value="excluded">
              <p className="mb-2 text-xs text-muted-foreground">
                Excluded value:{" "}
                <span className="font-semibold text-foreground">
                  {formatINR(ledger.summary.excludedValue)}
                </span>
              </p>
              <AwardTable awards={ledger.excludedAwards} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bandwidth Radar card
// ---------------------------------------------------------------------------

export function BandwidthRadarCard({
  assessment,
  bidderId,
}: {
  assessment: BandwidthAssessmentProp;
  bidderId: string;
}) {
  const { capacity, exposure, persisted } = assessment;
  const stats: { label: string; value: React.ReactNode }[] = [
    { label: "Active contracts", value: String(exposure.activeContractCount) },
    {
      label: "Active obligation value",
      value: formatINR(exposure.activeObligationValue),
    },
    {
      label: "Estimated capacity",
      value: formatINR(exposure.estimatedCapacity),
    },
    {
      label: "Remaining capacity",
      value: `${formatINR(exposure.remainingCapacityValue)} (${exposure.remainingCapacityPct.toFixed(2)}%)`,
    },
    {
      label: "Assessment timestamp",
      value: persisted ? (
        formatDateTime(persisted.assessedAt)
      ) : (
        <span className="text-muted-foreground">
          Live view — not yet persisted
        </span>
      ),
    },
  ];

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="inline-flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Bandwidth Radar · capacity exposure
            </CardTitle>
            <CardDescription>
              Advisory execution-capacity signal — separate from Compliance Risk.
              It never qualifies or disqualifies the bidder.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExposureBadge level={exposure.exposureLevel} />
            <Badge variant="outline">{assessment.dataSourceLabel}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Headline exposure */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-3xl font-bold tracking-tight">
              {exposure.exposurePct.toFixed(2)}%
            </p>
            <p className="text-xs text-muted-foreground">
              Advisory threshold:{" "}
              {capacity.recommendedExposureThresholdPct}% · {capacity.categoryUsed}{" "}
              basis
            </p>
          </div>
          <Progress
            value={exposure.exposurePct}
            indicatorClassName={exposureBarClass(exposure.exposureLevel)}
          />
        </div>

        {/* Key figures */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label} className="space-y-0.5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {s.label}
              </p>
              <p className="text-sm font-medium">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Transparent derivation */}
        <details className="rounded-md border bg-muted/40 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium underline-offset-2 hover:underline">
            How this is calculated (deterministic, no AI)
          </summary>
          <div className="mt-2 space-y-1.5 font-mono text-[11px] leading-relaxed">
            <p>{exposure.math}</p>
            <p>{capacity.basis}</p>
          </div>
        </details>

        {/* Ledger */}
        <ObligationLedger bidderId={bidderId} />

        {/* Advisory disclaimer */}
        <p
          role="note"
          className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-snug text-warning"
        >
          {assessment.disclaimer}
        </p>
      </CardContent>
    </Card>
  );
}

/** Fallback when no server-side capacity profile exists for the bidder. */
export function BandwidthRadarUnavailable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="inline-flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          Bandwidth Radar · capacity exposure
        </CardTitle>
        <CardDescription>
          Advisory execution-capacity signal — separate from Compliance Risk.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          No capacity profile is stored for this bidder, so exposure cannot be
          assessed. Re-run the seed to load the demo award ledger.
        </p>
      </CardContent>
    </Card>
  );
}
