"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Triggers POST /api/verify for a bidder, then refreshes server data so the new
 * run appears. Client component (needs interactivity); all work happens
 * server-side in the orchestrator.
 */
export function RunVerificationButton({
  bidderId,
  hasRun = false,
}: {
  bidderId: string;
  hasRun?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bidderId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Verification failed.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={run} disabled={loading} variant={hasRun ? "outline" : "default"}>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : hasRun ? (
          <RefreshCw className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {loading ? "Verifying…" : hasRun ? "Re-run verification" : "Run verification"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
