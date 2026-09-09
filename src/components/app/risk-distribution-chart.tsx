"use client";

import * as React from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

export interface RiskDatum {
  name: string;
  value: number;
  color: string;
}

export function RiskDistributionChart({ data }: { data: RiskDatum[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);

  if (total === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
        No verifications yet.
      </div>
    );
  }

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data.filter((d) => d.value > 0)}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
          >
            {data
              .filter((d) => d.value > 0)
              .map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [`${value} bidder(s)`, name]}
          />
          <Legend
            iconType="circle"
            formatter={(value: string) => {
              const d = data.find((x) => x.name === value);
              return `${value} (${d?.value ?? 0})`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
