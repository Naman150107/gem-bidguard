"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowDown,
  FlaskConical,
  Loader2,
  OctagonX,
  ShieldCheck,
  X,
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
import { Separator } from "@/components/ui/separator";
import { ExposureBadge } from "@/components/app/bandwidth-radar";
import type { ExposureLevel as ExposureLevelT } from "@/lib/types";
import { formatINR } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shapes (structural subset of the existing simulate-API payload, so this
// client component never imports the server-only service module).
// ---------------------------------------------------------------------------

interface SimulationResult {
  estimatedCapacity: number;
  proposedValue: number;
  current: {
    obligationValue: number;
    exposurePct: number;
    exposureLevel: ExposureLevelT;
  };
  projected: {
    obligationValue: number;
    exposurePct: number;
    exposureLevel: ExposureLevelT;
  };
  deltaPct: number;
  recommendedThresholdPct: number;
  projectedAboveThreshold: boolean;
  crossesRecommendedThreshold: boolean;
  worsensLevel: boolean;
  math: string;
}

interface SimulateResponse {
  disclaimer: string;
  dataSourceLabel: string;
  simulation: SimulationResult;
}

const MAX_VALUE = 5_000_000_000;

const inputClassName =
  "h-9 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const labelClassName =
  "mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground";

function parseValue(raw: string): number | null {
  const n = Number(raw.replace(/[,\s₹]/g, ""));
  if (!Number.isFinite(n)) return null;
  return n;
}

// ---------------------------------------------------------------------------
// Result view: Current → Proposed → Projected chain.
// ---------------------------------------------------------------------------

function SimulationResultView({ result }: { result: SimulationResult }) {
  const s = result;
  const steps: { label: string; value: React.ReactNode }[] = [
    {
      label: "Current Exposure",
      value: (
        <span className="inline-flex items-center gap-2">
          <span className="text-lg font-bold">
            {s.current.exposurePct.toFixed(2)}%
          </span>
          <ExposureBadge level={s.current.exposureLevel} />
        </span>
      ),
    },
    {
      label: "Proposed Award",
      value: (
        <span className="text-lg font-bold">+ {formatINR(s.proposedValue)}</span>
      ),
    },
    {
      label: "Projected Obligation",
      value: (
        <span className="text-lg font-bold">
          {formatINR(s.projected.obligationValue)}
        </span>
      ),
    },
    {
      label: "Projected Exposure %",
      value: (
        <span className="text-lg font-bold">
          {s.projected.exposurePct.toFixed(2)}%{" "}
          <span className="text-xs font-medium text-muted-foreground">
            ({s.deltaPct >= 0 ? "+" : ""}
            {s.deltaPct.toFixed(2)} pp)
          </span>
        </span>
      ),
    },
    {
      label: "Projected Exposure Level",
      value: <ExposureBadge level={s.projected.exposureLevel} />,
    },
  ];

  return (
    <div className="space-y-3">
      {s.crossesRecommendedThreshold && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-snug text-warning"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Crosses the recommended threshold ({s.recommendedThresholdPct}%):
            currently {s.current.exposurePct.toFixed(2)}% → projected{" "}
            {s.projected.exposurePct.toFixed(2)}%.
          </span>
        </p>
      )}
      {!s.crossesRecommendedThreshold && s.projectedAboveThreshold && (
        <p className="rounded-md border px-3 py-2 text-xs leading-snug text-muted-foreground">
          Projected exposure stays above the recommended threshold (
          {s.recommendedThresholdPct}%) — it was already there before this
          award.
        </p>
      )}
      {s.worsensLevel ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-snug text-destructive"
        >
          <OctagonX className="h-4 w-4 shrink-0" />
          <span>
            Exposure band worsens: {s.current.exposureLevel} →{" "}
            {s.projected.exposureLevel}.
          </span>
        </p>
      ) : (
        <p className="flex items-start gap-2 rounded-md border border-success/30 bg-success/10 px-3 py-2 text-xs leading-snug text-success">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>
            Exposure band does not worsen — stays {s.projected.exposureLevel}.
          </span>
        </p>
      )}

      <ol className="space-y-1">
        {steps.map((step, i) => (
          <li key={step.label}>
            {i > 0 && (
              <ArrowDown
                className="my-1 h-4 w-4 text-muted-foreground"
                aria-hidden
              />
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {step.label}
              </span>
              {step.value}
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-md border bg-muted/40 px-3 py-2 font-mono text-[11px] leading-relaxed">
        {s.math}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Simulation dialog (hand-rolled modal over existing Card/Button primitives;
// hypothetical only — it POSTs to the existing simulate API and never
// creates or modifies contracts).
// ---------------------------------------------------------------------------

function SimulateDialog({
  bidderId,
  onClose,
}: {
  bidderId: string;
  onClose: () => void;
}) {
  const [value, setValue] = React.useState("");
  const [duration, setDuration] = React.useState("12");
  const [category, setCategory] = React.useState("");
  const [state, setState] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = React.useState(false);
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<SimulateResponse | null>(null);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function validate(): {
    proposedValue: number;
    proposedDurationMonths?: number;
    proposedCategory?: string;
    proposedState?: string;
  } | null {
    const errors: Record<string, string> = {};
    const parsedValue = parseValue(value);
    if (value.trim() === "" || parsedValue === null) {
      errors.value = "Enter a numeric award value in INR.";
    } else if (parsedValue <= 0) {
      errors.value = "Award value must be greater than zero.";
    } else if (parsedValue > MAX_VALUE) {
      errors.value = `Award value must not exceed ${formatINR(MAX_VALUE)}.`;
    }
    let months: number | undefined;
    if (duration.trim() !== "") {
      const n = Number(duration.trim());
      if (!Number.isInteger(n) || n < 1 || n > 120) {
        errors.duration = "Duration must be a whole number of months (1–120).";
      } else {
        months = n;
      }
    }
    const cat = category.trim();
    if (cat.length > 80) errors.category = "Category must be ≤ 80 characters.";
    const st = state.trim();
    if (st.length > 80) errors.state = "State must be ≤ 80 characters.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0 || parsedValue === null) return null;
    return {
      proposedValue: Math.round(parsedValue),
      ...(months !== undefined ? { proposedDurationMonths: months } : {}),
      ...(cat ? { proposedCategory: cat } : {}),
      ...(st ? { proposedState: st } : {}),
    };
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const body = validate();
    if (!body) return;
    setLoading(true);
    setApiError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/bandwidth/${encodeURIComponent(bidderId)}/simulate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Simulation could not be completed.");
      }
      setResult((await res.json()) as SimulateResponse);
    } catch (err) {
      setApiError(
        err instanceof Error
          ? err.message
          : "Simulation could not be completed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-label="Simulate new award"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="inline-flex items-center gap-2 text-base">
                <FlaskConical className="h-4 w-4" />
                Simulate New Award
              </CardTitle>
              <CardDescription>
                Hypothetical projection only — stored awards are never modified
                and no contract is created.
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <form onSubmit={run} className="space-y-4" noValidate>
            <div>
              <label htmlFor="sim-value" className={labelClassName}>
                Proposed award value (INR) *
              </label>
              <input
                id="sim-value"
                className={inputClassName}
                inputMode="numeric"
                placeholder="e.g. 15000000  (= ₹1.50 Cr)"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              {fieldErrors.value && (
                <p className="mt-1 text-xs text-destructive">
                  {fieldErrors.value}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="sim-duration" className={labelClassName}>
                  Duration (months)
                </label>
                <input
                  id="sim-duration"
                  className={inputClassName}
                  inputMode="numeric"
                  placeholder="12"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
                {fieldErrors.duration && (
                  <p className="mt-1 text-xs text-destructive">
                    {fieldErrors.duration}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="sim-category" className={labelClassName}>
                  Category (optional)
                </label>
                <input
                  id="sim-category"
                  className={inputClassName}
                  placeholder="Goods"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
                {fieldErrors.category && (
                  <p className="mt-1 text-xs text-destructive">
                    {fieldErrors.category}
                  </p>
                )}
              </div>
            </div>
            <div>
              <label htmlFor="sim-state" className={labelClassName}>
                State (optional)
              </label>
              <input
                id="sim-state"
                className={inputClassName}
                placeholder="Maharashtra"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
              {fieldErrors.state && (
                <p className="mt-1 text-xs text-destructive">
                  {fieldErrors.state}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Category, state, and duration are informational only — they do not
              change the exposure math.
            </p>
            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Simulating…" : "Run Simulation"}
            </Button>
          </form>

          {apiError && (
            <p role="alert" className="text-xs text-destructive">
              {apiError}
            </p>
          )}

          {result && (
            <>
              <Separator />
              <SimulationResultView result={result.simulation} />
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{result.dataSourceLabel}</Badge>
              </div>
              <p
                role="note"
                className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-snug text-warning"
              >
                Capacity signal only — does not qualify or disqualify the
                bidder.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry card on the bidder page.
// ---------------------------------------------------------------------------

export function BandwidthSimulateCard({
  bidderId,
  available,
}: {
  bidderId: string;
  available: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="inline-flex items-center gap-2 text-base">
                <FlaskConical className="h-4 w-4" />
                What-If Award Simulation
              </CardTitle>
              <CardDescription>
                Project exposure if this vendor took on one more contract.
                Hypothetical only — no awards are created or modified.
              </CardDescription>
            </div>
            <Button onClick={() => setOpen(true)} disabled={!available}>
              <FlaskConical className="h-4 w-4" />
              Simulate New Award
            </Button>
          </div>
        </CardHeader>
        {!available && (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No capacity profile is stored for this bidder, so simulation is
              unavailable.
            </p>
          </CardContent>
        )}
      </Card>
      {open && <SimulateDialog bidderId={bidderId} onClose={() => setOpen(false)} />}
    </>
  );
}
