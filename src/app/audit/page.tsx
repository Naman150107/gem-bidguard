import { ScrollText } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  AuditLogTable,
  type AuditLogRow,
} from "@/components/app/audit-log-table";
import { getAuditEvents, getAuditNameMaps } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const [events, { bidderNames }] = await Promise.all([
    getAuditEvents(),
    getAuditNameMaps(),
  ]);

  const rows: AuditLogRow[] = events.map((e) => ({
    id: e.id,
    timestamp: e.timestamp.toISOString(),
    officer: e.officer,
    action: e.action,
    source: e.source,
    rule: e.rule,
    result: e.result,
    bidderId: e.bidderId,
    tenderId: e.tenderId,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit trail"
        description="Complete, append-only log of every verification step and officer decision across all bidders. This record supports transparency and post-award scrutiny."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4 text-primary" />
            All events
          </CardTitle>
          <CardDescription>
            Every AI extraction, government-source check, discrepancy, rule
            evaluation, risk score, and officer decision is recorded here with a
            timestamp and attribution. Entries are never edited or deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <ScrollText className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No audit events recorded yet.
              </p>
              <p className="text-xs text-muted-foreground">
                Run{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  npm run demo:verify
                </code>{" "}
                to generate verification runs, then reload this page.
              </p>
            </div>
          ) : (
            <AuditLogTable rows={rows} bidderNames={bidderNames} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
