import { prisma } from "./db";

/**
 * Server-side data access. Kept in one module so pages stay thin and the
 * include-shapes are consistent.
 */

// Latest verification run per bidder (for dashboard + tender tables).
export async function getBiddersWithLatestRun() {
  return prisma.bidder.findMany({
    orderBy: { name: "asc" },
    include: {
      tender: true,
      runs: { orderBy: { startedAt: "desc" }, take: 1 },
    },
  });
}

export async function getTenders() {
  const tenders = await prisma.tender.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { bidders: true, requirements: true, rules: true } },
    },
  });
  return tenders;
}

export async function getTenderById(id: string) {
  return prisma.tender.findUnique({
    where: { id },
    include: {
      requirements: { orderBy: { code: "asc" } },
      rules: { orderBy: { code: "asc" } },
      bidders: {
        orderBy: { name: "asc" },
        include: { runs: { orderBy: { startedAt: "desc" }, take: 1 } },
      },
    },
  });
}

// Full bidder detail with the latest run and all its evidence.
export async function getBidderDetail(id: string) {
  return prisma.bidder.findUnique({
    where: { id },
    include: {
      tender: { include: { requirements: { orderBy: { code: "asc" } } } },
      documents: { orderBy: { type: "asc" } },
      runs: {
        orderBy: { startedAt: "desc" },
        take: 1,
        include: {
          ruleResults: true,
          findings: true,
          discrepancies: true,
          providerResults: true,
          decision: true,
          auditEvents: { orderBy: { timestamp: "asc" } },
        },
      },
    },
  });
}

export async function getRunById(runId: string) {
  return prisma.verificationRun.findUnique({
    where: { id: runId },
    include: {
      bidder: { include: { documents: true } },
      tender: { include: { requirements: { orderBy: { code: "asc" } } } },
      ruleResults: true,
      findings: true,
      discrepancies: true,
      providerResults: true,
      decision: true,
      auditEvents: { orderBy: { timestamp: "asc" } },
    },
  });
}

export async function getRecentAuditEvents(limit = 15) {
  return prisma.auditEvent.findMany({
    orderBy: { timestamp: "desc" },
    take: limit,
  });
}

export async function getAuditEvents(filter?: {
  bidderId?: string;
  tenderId?: string;
}) {
  return prisma.auditEvent.findMany({
    where: {
      bidderId: filter?.bidderId,
      tenderId: filter?.tenderId,
    },
    orderBy: { timestamp: "desc" },
    take: 500,
  });
}

// Denormalized bidder+tender name lookups for the audit table.
export async function getAuditNameMaps() {
  const [bidders, tenders] = await Promise.all([
    prisma.bidder.findMany({ select: { id: true, name: true } }),
    prisma.tender.findMany({ select: { id: true, referenceNo: true } }),
  ]);
  const bidderNames = Object.fromEntries(bidders.map((b) => [b.id, b.name]));
  const tenderRefs = Object.fromEntries(tenders.map((t) => [t.id, t.referenceNo]));
  return { bidderNames, tenderRefs };
}
