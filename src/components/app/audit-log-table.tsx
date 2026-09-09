"use client";

import * as React from "react";
import Link from "next/link";
import { Search, Filter } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { humanizeAction } from "@/lib/labels";
import { formatDateTime } from "@/lib/utils";
import { AuditAction, type AuditAction as AuditActionT } from "@/lib/types";

export interface AuditLogRow {
  id: string;
  timestamp: string; // ISO
  officer: string;
  action: string;
  source: string | null;
  rule: string | null;
  result: string | null;
  bidderId: string | null;
  tenderId: string | null;
}

const ACTION_OPTIONS: AuditActionT[] = [
  AuditAction.VERIFICATION_STARTED,
  AuditAction.DOCUMENT_EXTRACTED,
  AuditAction.SOURCE_VERIFIED,
  AuditAction.DISCREPANCY_DETECTED,
  AuditAction.RULE_EVALUATED,
  AuditAction.RISK_SCORED,
  AuditAction.AI_SUMMARY,
  AuditAction.OFFICER_DECISION,
];

/**
 * Client-side filterable audit log. The trail is append-only server-side; this
 * view only filters/searches an immutable list handed down from the server.
 */
export function AuditLogTable({
  rows,
  bidderNames,
}: {
  rows: AuditLogRow[];
  bidderNames: Record<string, string>;
}) {
  const [action, setAction] = React.useState<string>("ALL");
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (action !== "ALL" && r.action !== action) return false;
      if (!q) return true;
      const hay = [
        r.officer,
        humanizeAction(r.action),
        r.source ?? "",
        r.rule ?? "",
        r.result ?? "",
        r.bidderId ? bidderNames[r.bidderId] ?? "" : "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, action, query, bidderNames]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search officer, source, rule, bidder…"
            className="w-full rounded-md border border-input bg-card py-2 pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <div className="relative">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="h-full min-w-[190px] appearance-none rounded-md border border-input bg-card py-2 pl-9 pr-8 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="ALL">All actions</option>
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {humanizeAction(a)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Showing {filtered.length} of {rows.length} event(s)
        </span>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Time</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Detail</TableHead>
              <TableHead>Bidder</TableHead>
              <TableHead>Officer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No audit events match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => {
                const detail = r.source ?? r.rule ?? null;
                const bidderName = r.bidderId
                  ? bidderNames[r.bidderId] ?? null
                  : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(r.timestamp)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium">
                        {humanizeAction(r.action)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {detail && (
                        <span className="font-mono text-xs">{detail}</span>
                      )}
                      {r.result && (
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {r.result}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.bidderId && bidderName ? (
                        <Link
                          href={`/bidders/${r.bidderId}`}
                          className="text-primary hover:underline"
                        >
                          {bidderName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.officer}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
