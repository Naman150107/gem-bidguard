import { prisma } from "../lib/db";
import type { AuditAction as AuditActionT } from "../lib/types";

/**
 * Append-only audit trail. Every meaningful step of a verification run is
 * recorded here so the whole decision chain is explainable and reviewable —
 * which government sources were checked, which rules fired, what the AI said,
 * and what the officer decided.
 */

export interface AuditEntry {
  runId?: string;
  tenderId?: string;
  bidderId?: string;
  officer: string;
  action: AuditActionT;
  source?: string;
  rule?: string;
  result?: string;
  evidence?: unknown;
  aiConfidence?: number;
  decision?: string;
}

/** Record a single audit event. */
export async function recordAudit(entry: AuditEntry) {
  return prisma.auditEvent.create({
    data: {
      runId: entry.runId,
      tenderId: entry.tenderId,
      bidderId: entry.bidderId,
      officer: entry.officer,
      action: entry.action,
      source: entry.source,
      rule: entry.rule,
      result: entry.result,
      evidence: entry.evidence === undefined ? undefined : (entry.evidence as object),
      aiConfidence: entry.aiConfidence,
      decision: entry.decision,
    },
  });
}

/** Record many audit events in one transaction (preserves order). */
export async function recordAuditBatch(entries: AuditEntry[]) {
  if (entries.length === 0) return;
  await prisma.auditEvent.createMany({
    data: entries.map((entry) => ({
      runId: entry.runId,
      tenderId: entry.tenderId,
      bidderId: entry.bidderId,
      officer: entry.officer,
      action: entry.action,
      source: entry.source,
      rule: entry.rule,
      result: entry.result,
      evidence: entry.evidence === undefined ? undefined : (entry.evidence as object),
      aiConfidence: entry.aiConfidence,
      decision: entry.decision,
    })),
  });
}
