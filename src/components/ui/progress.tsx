import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Simple, dependency-free progress bar. `indicatorClassName` lets callers tint
 * the fill (e.g. by risk level).
 */
export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number; // 0..100
  indicatorClassName?: string;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, indicatorClassName, ...props }, ref) => {
    const clamped = Math.max(0, Math.min(100, value));
    return (
      <div
        ref={ref}
        className={cn(
          "relative h-2.5 w-full overflow-hidden rounded-full bg-secondary",
          className,
        )}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        {...props}
      >
        <div
          className={cn(
            "h-full rounded-full bg-primary transition-all",
            indicatorClassName,
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    );
  },
);
Progress.displayName = "Progress";

export { Progress };
