import * as React from "react";
import { ShieldAlert } from "lucide-react";
import { AI_DISCLAIMER } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Mandatory disclaimer shown wherever AI verification results or
 * recommendations are presented. The AI is decision-support only.
 */
export function DisclaimerBanner({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 text-warning",
        compact ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm",
        className,
      )}
    >
      <ShieldAlert className={cn("shrink-0", compact ? "h-4 w-4" : "h-5 w-5")} />
      <span className="leading-snug">{AI_DISCLAIMER}</span>
    </div>
  );
}
