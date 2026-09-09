import * as React from "react";
import { RISK_COLOR } from "@/components/app/status";
import { riskLevelForScore } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * Circular compliance-score gauge (pure SVG, no deps). Color follows the risk
 * band derived from the score.
 */
export function ScoreGauge({
  score,
  size = 140,
  strokeWidth = 12,
  className,
}: {
  score: number | null | undefined;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const hasScore = typeof score === "number";
  const value = hasScore ? Math.max(0, Math.min(100, score as number)) : 0;
  const level = hasScore ? riskLevelForScore(value) : null;
  const color = level ? RISK_COLOR[level] : "#94a3b8";

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--secondary))"
          strokeWidth={strokeWidth}
        />
        {hasScore && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        )}
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-3xl font-bold tabular-nums" style={{ color: hasScore ? color : undefined }}>
          {hasScore ? value : "—"}
        </span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}
