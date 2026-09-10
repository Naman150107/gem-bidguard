"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DisclaimerBanner } from "@/components/app/disclaimer";
import { DecisionBadge } from "@/components/app/status";
import { DecisionStatus, type DecisionStatus as DecisionStatusT } from "@/lib/types";

/**
 * Human-in-the-loop decision control. The Procurement Officer records the final
 * QUALIFY / REJECT here. The AI recommendation is advisory only — this action
 * is what actually sets the outcome.
 */
export function DecisionPanel({
  runId,
  current,
  officerName,
}: {
  runId: string;
  current: DecisionStatusT;
  officerName: string;
}) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState<DecisionStatusT | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(decision: typeof DecisionStatus.QUALIFIED | typeof DecisionStatus.REJECTED) {
    setPending(decision);
    setError(null);
    try {
      const res = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, decision, note: note.trim() || undefined }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not record decision.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not record decision.");
    } finally {
      setPending(null);
    }
  }

  const decided = current !== DecisionStatus.PENDING;

  return (
    <div className="space-y-4">
      <DisclaimerBanner compact />

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Current decision
        </div>
        <DecisionBadge status={current} />
      </div>

      <div className="space-y-2">
        <label htmlFor="decision-note" className="text-sm font-medium">
          Officer note {decided ? "" : "(optional)"}
        </label>
        <textarea
          id="decision-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Rationale, clarifications requested, or conditions…"
          className="w-full resize-y rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-success/40 bg-success/[0.06] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-success">
            Officer action · Qualify
          </p>
          <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
            Bidder meets requirements in your judgment.
          </p>
          <Button
            variant="success"
            className="w-full"
            onClick={() => submit(DecisionStatus.QUALIFIED)}
            disabled={pending !== null}
          >
            {pending === DecisionStatus.QUALIFIED ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Qualify bidder
          </Button>
        </div>
        <div className="rounded-md border border-destructive/40 bg-destructive/[0.06] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-destructive">
            Officer action · Reject
          </p>
          <p className="mb-2 mt-0.5 text-xs text-muted-foreground">
            Bidder fails requirements in your judgment.
          </p>
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => submit(DecisionStatus.REJECTED)}
            disabled={pending !== null}
          >
            {pending === DecisionStatus.REJECTED ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Ban className="h-4 w-4" />
            )}
            Reject bidder
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Recording as {officerName}. This decision is logged to the audit trail.
      </p>
    </div>
  );
}
