import * as React from "react";
import { humanizeAction } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";

interface AuditRow {
  id: string;
  timestamp: Date;
  officer: string;
  action: string;
  source?: string | null;
  rule?: string | null;
  result?: string | null;
  decision?: string | null;
}

/**
 * Renders an ordered audit trail. Read-only; the trail is append-only server
 * side. Used on the verification/bidder pages and (compact) elsewhere.
 */
export function AuditTrail({ events }: { events: AuditRow[] }) {
  if (events.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No audit events recorded yet.
      </p>
    );
  }

  return (
    <ol className="relative space-y-4 border-l pl-6">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="text-sm font-medium">
              {humanizeAction(e.action)}
              {(e.source || e.rule) && (
                <span className="font-normal text-muted-foreground">
                  {" · "}
                  {e.source ?? e.rule}
                </span>
              )}
            </p>
            <time className="text-xs text-muted-foreground">
              {formatDateTime(e.timestamp)}
            </time>
          </div>
          <p className="text-xs text-muted-foreground">
            {e.result ? `${e.result} — ` : ""}
            {e.officer}
          </p>
        </li>
      ))}
    </ol>
  );
}
