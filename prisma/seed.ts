/**
 * Database seed — loads the canonical demo dataset (1 tender, its requirements
 * and rules, and 3 bidders with their documents and — in a later slice — their
 * verification runs).
 *
 * Run with:  npm run db:seed   (or  npm run db:reset  to wipe + reseed)
 *
 * NOTE: This seed inserts static data only. Verification runs are produced by
 * the orchestrator (see `npm run demo:verify`, wired in a later slice) or by
 * clicking "Run verification" in the UI.
 */

import { PrismaClient } from "@prisma/client";
import { demoDataset } from "../src/data/demo";
import { demoAwardBook } from "../src/data/gem-awards";
import { computeCapacity } from "../src/server/engine/bandwidth";

const prisma = new PrismaClient();

function toDate(value?: string): Date | null {
  return value ? new Date(value) : null;
}

async function clearAll() {
  // Delete in FK-safe order (most children cascade, but explicit is clearest).
  await prisma.auditEvent.deleteMany();
  await prisma.officerDecision.deleteMany();
  await prisma.providerResult.deleteMany();
  await prisma.discrepancy.deleteMany();
  await prisma.finding.deleteMany();
  await prisma.ruleResult.deleteMany();
  await prisma.verificationRun.deleteMany();
  await prisma.document.deleteMany();
  // Bandwidth Radar tables (independent of the compliance pipeline).
  await prisma.bandwidthAssessment.deleteMany();
  await prisma.geMAward.deleteMany();
  await prisma.vendorCapacityProfile.deleteMany();
  await prisma.bidder.deleteMany();
  await prisma.rule.deleteMany();
  await prisma.tenderRequirement.deleteMany();
  await prisma.tender.deleteMany();
}

async function main() {
  console.log("→ Clearing existing data...");
  await clearAll();

  const { tender, requirements, rules, bidders } = demoDataset;

  console.log("→ Creating tender:", tender.referenceNo);
  const createdTender = await prisma.tender.create({
    data: {
      referenceNo: tender.referenceNo,
      title: tender.title,
      ministry: tender.ministry,
      category: tender.category,
      estimatedValue: tender.estimatedValue,
      bidSubmissionDeadline: new Date(tender.bidSubmissionDeadline),
      description: tender.description,
      requirements: {
        create: requirements.map((r) => ({
          code: r.code,
          title: r.title,
          description: r.description,
          mandatory: r.mandatory,
          category: r.category,
        })),
      },
    },
  });

  console.log(`→ Creating ${rules.length} compliance rules...`);
  for (const rule of rules) {
    await prisma.rule.create({
      data: {
        tenderId: createdTender.id,
        code: rule.code,
        title: rule.title,
        description: rule.description,
        scope: rule.scope,
        weightCategory: rule.weightCategory,
        severityOnFail: rule.severityOnFail,
        config: (rule.config ?? {}) as object,
      },
    });
  }

  console.log(`→ Creating ${bidders.length} bidders with documents...`);
  for (const b of bidders) {
    await prisma.bidder.create({
      data: {
        tenderId: createdTender.id,
        name: b.name,
        legalName: b.legalName,
        pan: b.pan,
        gstin: b.gstin,
        udyamNumber: b.udyamNumber ?? null,
        cin: b.cin ?? null,
        msmeCategory: b.msmeCategory ?? null,
        isStartup: b.isStartup,
        address: b.address,
        contactEmail: b.contactEmail,
        contactPhone: b.contactPhone,
        declaredLocalContentPct: b.declaredLocalContentPct ?? null,
        expectedRiskNote: b.expectedRiskNote,
        documents: {
          create: b.documents.map((d) => ({
            type: d.type,
            fileName: d.fileName,
            mimeType: "text/plain",
            content: d.content,
            issueDate: toDate(d.issueDate),
            expiryDate: toDate(d.expiryDate),
            status: "UPLOADED",
          })),
        },
      },
    });
    console.log(`   ✓ ${b.name} (${b.documents.length} documents)`);
  }

  console.log("→ Seeding Bandwidth Radar award ledger + capacity profiles (simulated)...");
  // Map demo bidder key -> created bidder row (matched by legalName via demoDataset).
  const createdBidders = await prisma.bidder.findMany({
    where: { tenderId: createdTender.id },
  });
  const keyToBidderId = new Map<string, string>();
  for (const demoBidder of bidders) {
    const row = createdBidders.find((r) => r.name === demoBidder.name);
    if (row) keyToBidderId.set(demoBidder.key, row.id);
  }
  for (const book of demoAwardBook) {
    const bidderId = keyToBidderId.get(book.bidderKey);
    if (!bidderId) {
      console.warn(`   ! No bidder row for award-book key ${book.bidderKey}; skipping.`);
      continue;
    }
    const bidderRow = createdBidders.find((r) => r.id === bidderId);
    // Capacity inputs are server-trusted seed values (never client-provided).
    // The estimated capacity is DERIVED via the deterministic engine — not hard-coded.
    const capacity = computeCapacity({
      turnover: book.capacity.turnover,
      workforce: book.capacity.workforce,
      msmeCategory: bidderRow?.msmeCategory ?? null,
    });
    await prisma.vendorCapacityProfile.upsert({
      where: { bidderId },
      create: {
        bidderId,
        estimatedCapacity: capacity.estimatedCapacity,
        capacityBasis: capacity.basis,
        turnoverBasis: book.capacity.turnover,
        workforceBasis: book.capacity.workforce,
        recommendedExposureThreshold:
          capacity.recommendedExposureThresholdPct,
      },
      update: {
        estimatedCapacity: capacity.estimatedCapacity,
        capacityBasis: capacity.basis,
        turnoverBasis: book.capacity.turnover,
        workforceBasis: book.capacity.workforce,
        recommendedExposureThreshold:
          capacity.recommendedExposureThresholdPct,
      },
    });
    for (const a of book.awards) {
      await prisma.geMAward.upsert({
        where: { referenceNo: a.referenceNo },
        create: {
          bidderId,
          referenceNo: a.referenceNo,
          title: a.title,
          category: a.category,
          procuringOrg: a.procuringOrg,
          state: a.state,
          awardValue: a.awardValue,
          awardDate: new Date(a.awardDate),
          contractStart: new Date(a.contractStart),
          expectedCompletion: new Date(a.expectedCompletion),
          status: a.status,
          source: "SEEDED",
          isMock: true,
        },
        update: {},
      });
    }
    console.log(`   ✓ ${book.bidderKey} (${book.awards.length} simulated awards)`);
  }

  console.log("\n✅ Seed complete.");
  console.log(`   Tender: ${createdTender.referenceNo}`);
  console.log(`   Rules:  ${rules.length}`);
  console.log(`   Bidders: ${bidders.map((b) => b.name).join(", ")}`);
  console.log("\n   Next: run verifications from the UI, or `npm run demo:verify`.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
