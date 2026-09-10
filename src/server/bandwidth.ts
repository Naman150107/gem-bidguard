import "server-only";
import { z } from "zod";
import { prisma } from "../lib/db";
import {
  AuditAction,
  BANDWIDTH_DISCLAIMER,
  GEM_AWARD_DATA_LABEL,
  type AwardStatus as AwardStatusT,
} from "../lib/types";
import {
  computeCapacity,
  computeExposure,
  simulateAward,
  type BandwidthAward,
  type BandwidthResult,
  type SimulationInput,
  type SimulationResult,
} from "./engine/bandwidth";
import { recordAudit } from "./audit";

/**
 * Bandwidth Radar service layer — the ONLY server entry point for the
 * concurrent-obligation capacity-exposure feature.
 *
 * Invariants (enforced here, not in the UI):
 * - Every number comes from the deterministic engine in
 *   `src/server/engine/bandwidth.ts`. Nothing is hard-coded.
 * - Capacity inputs (turnover / workforce / MSME class) always come from
 *   server-side database rows (`VendorCapacityProfile` + `Bidder`), never
 *   from the client request body.
 * - Only ACTIVE awards contribute to live exposure; COMPLETED and CANCELLED
 *   awards are classified as excluded by the engine and reported as such.
 * - This is a CAPACITY-EXPOSURE signal only. It never sets qualification
 *   state and never touches the compliance engine. Every payload carries
 *   `kind: "bandwidth_exposure"` plus the advisory disclaimer to preserve
 *   that distinction for future frontend work.
 * - Award data in this MVP is demo/simulated (source SEEDED, isMock true)
 *   and every payload labels it via `dataSourceLabel`.
 */

const KIND = "bandwidth_exposure" as const;

function toBandwidthAward(a: {
  referenceNo: string;
  title: string;
  category: string;
  procuringOrg: string;
  state: string;
  awardValue: number;
  status: string;
  awardDate: Date;
  contractStart: Date;
  expectedCompletion: Date;
}): BandwidthAward {
  return {
    referenceNo: a.referenceNo,
    title: a.title,
    category: a.category,
    procuringOrg: a.procuringOrg,
    state: a.state,
    awardValue: a.awardValue,
    status: a.status as AwardStatusT,
    awardDate: a.awardDate.toISOString().slice(0, 10),
    contractStart: a.contractStart.toISOString().slice(0, 10),
    expectedCompletion: a.expectedCompletion.toISOString().slice(0, 10),
  };
}

async function loadBidderInputs(bidderId: string) {
  const bidder = await prisma.bidder.findUnique({
    where: { id: bidderId },
    include: {
      capacityProfile: true,
      gemAwards: { orderBy: { awardDate: "desc" } },
    },
  });
  if (!bidder) throw new Error(`Bidder ${bidderId} not found`);
  if (!bidder.capacityProfile) {
    throw new Error(
      `No server-side capacity profile for bidder ${bidderId}. Re-run the seed.`,
    );
  }
  return bidder;
}

/** Recompute capacity + exposure purely from server-side DB rows. */
function computeLive(args: {
  msmeCategory: string | null;
  turnoverBasis: number;
  workforceBasis: number;
  awards: Parameters<typeof toBandwidthAward>[0][];
}): { capacity: ReturnType<typeof computeCapacity>; exposure: BandwidthResult } {
  // Capacity inputs come from the stored server-side profile + bidder row.
  const capacity = computeCapacity({
    turnover: args.turnoverBasis,
    workforce: args.workforceBasis,
    msmeCategory: args.msmeCategory ?? null,
  });
  const exposure = computeExposure(
    args.awards.map(toBandwidthAward),
    capacity.estimatedCapacity,
  );
  return { capacity, exposure };
}

/** Narrow a loaded bidder row to its non-null server-side capacity inputs. */
function liveArgs(bidder: Awaited<ReturnType<typeof loadBidderInputs>>) {
  const profile = bidder.capacityProfile;
  if (!profile) throw new Error("Missing capacity profile");
  return {
    profile,
    msmeCategory: bidder.msmeCategory,
    turnoverBasis: profile.turnoverBasis,
    workforceBasis: profile.workforceBasis,
    awards: bidder.gemAwards,
  };
}

function basePayload(
  bidder: { id: string; name: string },
  profile: {
    turnoverBasis: number;
    workforceBasis: number;
    recommendedExposureThreshold: number;
  },
  capacity: ReturnType<typeof computeCapacity>,
  exposure: BandwidthResult,
) {
  return {
    kind: KIND,
    // Explicit separation: this is execution-capacity exposure, NOT compliance risk.
    disclaimer: BANDWIDTH_DISCLAIMER,
    dataSourceLabel: GEM_AWARD_DATA_LABEL,
    dataSource: { source: "SEEDED", isMock: true } as const,
    bidder: { id: bidder.id, name: bidder.name },
    capacity: {
      estimatedCapacity: capacity.estimatedCapacity,
      turnoverBasis: profile.turnoverBasis,
      workforceBasis: profile.workforceBasis,
      categoryUsed: capacity.categoryUsed,
      categoryFactor: capacity.categoryFactor,
      basis: capacity.basis,
      recommendedExposureThresholdPct:
        capacity.recommendedExposureThresholdPct,
    },
    exposure: {
      exposurePct: exposure.exposurePct,
      exposureLevel: exposure.exposureLevel,
      activeContractCount: exposure.activeContractCount,
      activeObligationValue: exposure.activeObligationValue,
      estimatedCapacity: exposure.estimatedCapacity,
      remainingCapacityValue: exposure.remainingCapacityValue,
      remainingCapacityPct: exposure.remainingCapacityPct,
      math: exposure.math,
    },
  };
}

// ---------------------------------------------------------------------------
// 1. Current assessment (latest persisted snapshot + live engine view)
// ---------------------------------------------------------------------------

export async function getBandwidthAssessment(bidderId: string) {
  const bidder = await loadBidderInputs(bidderId);
  const args = liveArgs(bidder);
  const { capacity, exposure } = computeLive(args);
  const latest = await prisma.bandwidthAssessment.findFirst({
    where: { bidderId },
    orderBy: { assessedAt: "desc" },
  });
  return {
    ...basePayload(bidder, args.profile, capacity, exposure),
    persisted: latest
      ? {
          id: latest.id,
          currentExposurePct: latest.currentExposurePct,
          exposureLevel: latest.exposureLevel,
          activeContractCount: latest.activeContractCount,
          activeObligationValue: latest.activeObligationValue,
          estimatedCapacity: latest.estimatedCapacity,
          remainingCapacityPct: latest.remainingCapacityPct,
          calculationEvidence: latest.calculationEvidence,
          assessedAt: latest.assessedAt,
        }
      : null,
  };
}

// ---------------------------------------------------------------------------
// 2. Award ledger (active vs excluded — classification done by the engine)
// ---------------------------------------------------------------------------

export async function getAwardLedger(bidderId: string) {
  const bidder = await loadBidderInputs(bidderId);
  const args = liveArgs(bidder);
  const { capacity, exposure } = computeLive(args);
  const allMock = bidder.gemAwards.every((a) => a.isMock);
  return {
    kind: KIND,
    disclaimer: BANDWIDTH_DISCLAIMER,
    dataSourceLabel: GEM_AWARD_DATA_LABEL,
    dataSource: { source: "SEEDED", isMock: allMock } as const,
    bidder: { id: bidder.id, name: bidder.name },
    summary: {
      activeContractCount: exposure.activeContractCount,
      activeObligationValue: exposure.activeObligationValue,
      excludedCount: exposure.excludedAwards.length,
      excludedValue: exposure.excludedAwards.reduce(
        (sum, a) => sum + a.awardValue,
        0,
      ),
      estimatedCapacity: capacity.estimatedCapacity,
      exposurePct: exposure.exposurePct,
      exposureLevel: exposure.exposureLevel,
    },
    // ONLY ACTIVE awards contribute to live exposure; everything else is
    // excluded by the engine (COMPLETED / CANCELLED) and listed for audit.
    activeAwards: exposure.includedAwards,
    excludedAwards: exposure.excludedAwards,
  };
}

// ---------------------------------------------------------------------------
// 3. Recalculate + persist a fresh assessment snapshot
// ---------------------------------------------------------------------------

export async function recalculateBandwidth(
  bidderId: string,
  opts: { officer: string },
) {
  const bidder = await loadBidderInputs(bidderId);
  const args = liveArgs(bidder);
  const { capacity, exposure } = computeLive(args);

  // Keep the stored capacity row in sync with the deterministic derivation
  // (still 100% server-side data — never client input).
  if (
    args.profile.estimatedCapacity !== capacity.estimatedCapacity ||
    args.profile.capacityBasis !== capacity.basis
  ) {
    await prisma.vendorCapacityProfile.update({
      where: { bidderId },
      data: {
        estimatedCapacity: capacity.estimatedCapacity,
        capacityBasis: capacity.basis,
      },
    });
  }

  const saved = await prisma.bandwidthAssessment.create({
    data: {
      bidderId,
      currentExposurePct: exposure.exposurePct,
      activeContractCount: exposure.activeContractCount,
      activeObligationValue: exposure.activeObligationValue,
      estimatedCapacity: exposure.estimatedCapacity,
      remainingCapacityPct: exposure.remainingCapacityPct,
      exposureLevel: exposure.exposureLevel,
      calculationEvidence: {
        math: exposure.math,
        capacityBasis: capacity.basis,
        turnoverBasis: args.profile.turnoverBasis,
        workforceBasis: args.profile.workforceBasis,
        categoryUsed: capacity.categoryUsed,
        categoryFactor: capacity.categoryFactor,
        recommendedExposureThresholdPct:
          capacity.recommendedExposureThresholdPct,
        includedAwards: exposure.includedAwards,
        excludedAwards: exposure.excludedAwards,
        dataSource: { source: "SEEDED", isMock: true },
      } as unknown as object,
    },
  });

  await recordAudit({
    tenderId: bidder.tenderId,
    bidderId,
    officer: opts.officer,
    action: AuditAction.BANDWIDTH_ASSESSED,
    result: `${exposure.exposurePct.toFixed(2)}% / ${exposure.exposureLevel}`,
    evidence: {
      assessmentId: saved.id,
      math: exposure.math,
      kind: KIND,
    },
  });

  return {
    ...basePayload(bidder, args.profile, capacity, exposure),
    persisted: {
      id: saved.id,
      assessedAt: saved.assessedAt,
    },
  };
}

// ---------------------------------------------------------------------------
// 4. What-if simulation (pure — never mutates stored awards)
// ---------------------------------------------------------------------------

export const simulationInputSchema = z.object({
  // Proposed NEW award value in INR. Positive, finite, capped to keep the
  // projection meaningful (₹500 Cr upper bound for the demo).
  proposedValue: z.number().finite().positive().max(5_000_000_000),
  // Informational only — does not change the exposure math.
  proposedDurationMonths: z.number().int().min(1).max(120).optional(),
  proposedCategory: z.string().trim().min(1).max(80).optional(),
  proposedState: z.string().trim().min(1).max(80).optional(),
});

export type SimulationRequestInput = z.infer<typeof simulationInputSchema>;

export async function simulateBandwidthAward(
  bidderId: string,
  rawInput: unknown,
  opts: { officer: string },
): Promise<
  ReturnType<typeof basePayload> & {
    simulation: SimulationResult;
    simulationInput: SimulationInput;
  }
> {
  const parsed = simulationInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw Object.assign(new Error("Invalid simulation input."), {
      status: 400,
      details: parsed.error.flatten(),
    });
  }
  const bidder = await loadBidderInputs(bidderId);
  const args = liveArgs(bidder);
  const { capacity, exposure } = computeLive(args);
  const simulation = simulateAward(exposure, {
    proposedValue: parsed.data.proposedValue,
    proposedDurationMonths: parsed.data.proposedDurationMonths,
    proposedCategory: parsed.data.proposedCategory,
    proposedState: parsed.data.proposedState,
  });

  await recordAudit({
    tenderId: bidder.tenderId,
    bidderId,
    officer: opts.officer,
    action: AuditAction.AWARD_SIMULATION_RUN,
    result: `${simulation.projected.exposurePct.toFixed(2)}% / ${simulation.projected.exposureLevel}`,
    evidence: {
      kind: KIND,
      proposedValue: simulation.proposedValue,
      math: simulation.math,
      crossesRecommendedThreshold: simulation.crossesRecommendedThreshold,
      worsensLevel: simulation.worsensLevel,
    },
  });

  return {
    ...basePayload(bidder, args.profile, capacity, exposure),
    simulationInput: {
      proposedValue: parsed.data.proposedValue,
      proposedDurationMonths: parsed.data.proposedDurationMonths,
      proposedCategory: parsed.data.proposedCategory,
      proposedState: parsed.data.proposedState,
    },
    simulation,
  };
}

// ---------------------------------------------------------------------------
// 5. Marketplace overview — structured data for a future frontend Radar
// ---------------------------------------------------------------------------

export async function getBandwidthOverview() {
  const bidders = await prisma.bidder.findMany({
    orderBy: { name: "asc" },
    include: {
      capacityProfile: true,
      gemAwards: true,
      bandwidthAssessments: {
        orderBy: { assessedAt: "desc" },
        take: 1,
      },
    },
  });
  const vendors = bidders
    .filter((b) => b.capacityProfile)
    .map((b) => {
      const profile = b.capacityProfile!;
      const { capacity, exposure } = computeLive({
        msmeCategory: b.msmeCategory,
        turnoverBasis: profile.turnoverBasis,
        workforceBasis: profile.workforceBasis,
        awards: b.gemAwards,
      });
      const latest = b.bandwidthAssessments[0] ?? null;
      return {
        bidder: { id: b.id, name: b.name, msmeCategory: b.msmeCategory },
        capacity: {
          estimatedCapacity: capacity.estimatedCapacity,
          recommendedExposureThresholdPct:
            capacity.recommendedExposureThresholdPct,
        },
        exposure: {
          exposurePct: exposure.exposurePct,
          exposureLevel: exposure.exposureLevel,
          activeContractCount: exposure.activeContractCount,
          activeObligationValue: exposure.activeObligationValue,
          remainingCapacityPct: exposure.remainingCapacityPct,
        },
        lastAssessedAt: latest?.assessedAt ?? null,
      };
    })
    .sort((a, b) => b.exposure.exposurePct - a.exposure.exposurePct);
  return {
    kind: KIND,
    disclaimer: BANDWIDTH_DISCLAIMER,
    dataSourceLabel: GEM_AWARD_DATA_LABEL,
    dataSource: { source: "SEEDED", isMock: true } as const,
    vendors,
  };
}
