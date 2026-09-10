/**
 * Canonical demo GeM award dataset — the single source of truth for the
 * Bandwidth Radar (concurrent-obligation capacity) layer.
 *
 * ⚠️  DEMO / SIMULATED DATA. These are NOT real GeM contracts. They exist so the
 * capacity-exposure engine can be demonstrated end-to-end without a live GeM
 * award feed. Every seeded award is stored with source = "SEEDED" / isMock =
 * true and is surfaced in the UI under the label "Demo / Simulated GeM Award
 * Data". A future authorized GeM award integration would register a new source
 * behind the provider interface (src/server/providers/gem-award.ts) WITHOUT
 * changing the exposure engine or this file's shape.
 *
 * The three vendors' headline exposures are ENGINEERED but NOT hard-coded — they
 * emerge from the deterministic capacity model (see CAPACITY_MODEL in config.ts)
 * applied to the inputs below:
 *
 *   estimatedCapacity = round( turnover × 1.5 × categoryFactor
 *                              + workforce × 200,000 )
 *   exposure %        = (Σ ACTIVE award values) / estimatedCapacity × 100
 *
 * so that, deterministically and reproducibly:
 *
 *   ABC Engineering   capacity ₹15.90 Cr  active ₹5.40 Cr  → 33.96%  HEALTHY
 *   XYZ Manufacturing capacity ₹8.175 Cr  active ₹6.38 Cr  → 78.04%  WATCH
 *   PQR Technologies  capacity ₹2.8625 Cr active ₹2.748 Cr → 96.00%  CRITICAL
 *
 * COMPLETED and CANCELLED awards are included on purpose so the engine can prove
 * it excludes them from the live obligation load.
 *
 * Turnover bases mirror each bidder's CA-certified ITR average in
 * `src/data/demo.ts` (ABC ₹8.20 Cr, XYZ ₹3.40 Cr, PQR ₹1.10 Cr) so the two
 * layers stay mutually consistent. Workforce is a demo-only capacity input.
 */

import { AwardStatus, type AwardStatus as AwardStatusT } from "../lib/types";

/** One simulated GeM contract awarded to a vendor. */
export interface GemAwardSeed {
  /** GeM-style contract/award reference (demo). */
  referenceNo: string;
  title: string;
  /** Procurement category: "Goods" | "Services" | "Works". */
  category: string;
  /** Awarding ministry / PSU / department. */
  procuringOrg: string;
  /** Region of performance (Indian state / UT). */
  state: string;
  /** Contract value in INR. */
  awardValue: number;
  awardDate: string; // ISO date
  contractStart: string; // ISO date
  expectedCompletion: string; // ISO date
  status: AwardStatusT;
}

/** Deterministic capacity inputs for a vendor (server-trusted, never client). */
export interface VendorCapacitySeed {
  /** Average annual turnover in INR (mirrors the ITR average in demo.ts). */
  turnover: number;
  /** Declared workforce headcount (demo capacity input). */
  workforce: number;
}

/** A vendor's simulated GeM order book plus its capacity inputs. */
export interface VendorAwardBook {
  /** Matches DemoBidder.key in src/data/demo.ts ("ABC" | "XYZ" | "PQR"). */
  bidderKey: string;
  capacity: VendorCapacitySeed;
  awards: GemAwardSeed[];
}

// ---------------------------------------------------------------------------
// ABC Engineering — healthy headroom (34% HEALTHY)
//   3 ACTIVE awards summing to ₹5.40 Cr; capacity ₹15.90 Cr.
// ---------------------------------------------------------------------------

const abcAwards: GemAwardSeed[] = [
  {
    referenceNo: "GEM/2025/B/ABC/5510021",
    title: "Supply of API-610 centrifugal pumps — refinery utilities",
    category: "Goods",
    procuringOrg: "Indian Oil Corporation Ltd (IOCL)",
    state: "Maharashtra",
    awardValue: 22_000_000,
    awardDate: "2025-11-18",
    contractStart: "2025-12-01",
    expectedCompletion: "2026-12-15",
    status: AwardStatus.ACTIVE,
  },
  {
    referenceNo: "GEM/2026/B/ABC/5512874",
    title: "Supply & installation of process pumps — fertiliser plant",
    category: "Goods",
    procuringOrg: "Gujarat Narmada Valley Fertilizers (GNFC)",
    state: "Gujarat",
    awardValue: 18_000_000,
    awardDate: "2026-02-05",
    contractStart: "2026-03-01",
    expectedCompletion: "2027-01-31",
    status: AwardStatus.ACTIVE,
  },
  {
    referenceNo: "GEM/2026/B/ABC/5518903",
    title: "Comprehensive AMC — pumping stations (2 years)",
    category: "Services",
    procuringOrg: "Municipal Corporation of Greater Mumbai",
    state: "Maharashtra",
    awardValue: 14_000_000,
    awardDate: "2026-05-22",
    contractStart: "2026-06-15",
    expectedCompletion: "2028-06-14",
    status: AwardStatus.ACTIVE,
  },
  // --- Excluded from live exposure (proves filtering) ---------------------
  {
    referenceNo: "GEM/2024/B/ABC/5401552",
    title: "Supply of dewatering pump sets — completed order",
    category: "Goods",
    procuringOrg: "Maharashtra Jeevan Pradhikaran",
    state: "Maharashtra",
    awardValue: 30_000_000,
    awardDate: "2023-08-10",
    contractStart: "2023-09-01",
    expectedCompletion: "2024-08-31",
    status: AwardStatus.COMPLETED,
  },
  {
    referenceNo: "GEM/2025/B/ABC/5509110",
    title: "Booster pump supply — tender withdrawn",
    category: "Goods",
    procuringOrg: "Bangalore Water Supply & Sewerage Board",
    state: "Karnataka",
    awardValue: 12_000_000,
    awardDate: "2025-07-01",
    contractStart: "2025-07-20",
    expectedCompletion: "2026-07-19",
    status: AwardStatus.CANCELLED,
  },
];

// ---------------------------------------------------------------------------
// XYZ Manufacturing — approaching over-commitment (78% WATCH)
//   6 ACTIVE awards summing to ₹6.38 Cr; capacity ₹8.175 Cr.
// ---------------------------------------------------------------------------

const xyzAwards: GemAwardSeed[] = [
  {
    referenceNo: "GEM/2025/B/XYZ/6620145",
    title: "Supply of NK-series centrifugal pumps — GIDC water works",
    category: "Goods",
    procuringOrg: "Gujarat Water Supply & Sewerage Board",
    state: "Gujarat",
    awardValue: 15_000_000,
    awardDate: "2025-10-09",
    contractStart: "2025-11-01",
    expectedCompletion: "2026-11-30",
    status: AwardStatus.ACTIVE,
  },
  {
    referenceNo: "GEM/2025/B/XYZ/6623307",
    title: "Supply of industrial pump spares — refinery",
    category: "Goods",
    procuringOrg: "Bharat Petroleum Corporation Ltd (BPCL)",
    state: "Gujarat",
    awardValue: 12_800_000,
    awardDate: "2025-12-12",
    contractStart: "2026-01-05",
    expectedCompletion: "2026-12-20",
    status: AwardStatus.ACTIVE,
  },
  {
    referenceNo: "GEM/2026/B/XYZ/6628841",
    title: "Erection & commissioning of pumping infrastructure",
    category: "Works",
    procuringOrg: "Gujarat Industrial Development Corporation",
    state: "Gujarat",
    awardValue: 11_000_000,
    awardDate: "2026-01-28",
    contractStart: "2026-02-20",
    expectedCompletion: "2027-02-19",
    status: AwardStatus.ACTIVE,
  },
  {
    referenceNo: "GEM/2026/B/XYZ/6631190",
    title: "Supply of submersible pump sets — Delhi Jal Board",
    category: "Goods",
    procuringOrg: "Delhi Jal Board",
    state: "Delhi",
    awardValue: 10_000_000,
    awardDate: "2026-03-15",
    contractStart: "2026-04-01",
    expectedCompletion: "2027-03-31",
    status: AwardStatus.ACTIVE,
  },
  {
    referenceNo: "GEM/2026/B/XYZ/6635522",
    title: "Civil & mechanical works — effluent pumping station",
    category: "Works",
    procuringOrg: "Gujarat Pollution Control Board",
    state: "Gujarat",
    awardValue: 8_000_000,
    awardDate: "2026-04-30",
    contractStart: "2026-05-20",
    expectedCompletion: "2027-05-19",
    status: AwardStatus.ACTIVE,
  },
  {
    referenceNo: "GEM/2026/B/XYZ/6639018",
    title: "Supply of monoblock pumps — municipal supply",
    category: "Goods",
    procuringOrg: "New Delhi Municipal Council (NDMC)",
    state: "Delhi",
    awardValue: 7_000_000,
    awardDate: "2026-06-11",
    contractStart: "2026-07-01",
    expectedCompletion: "2027-06-30",
    status: AwardStatus.ACTIVE,
  },
  // --- Excluded from live exposure (proves filtering) ---------------------
  {
    referenceNo: "GEM/2024/B/XYZ/6510774",
    title: "Supply of end-suction pumps — delivered & closed",
    category: "Goods",
    procuringOrg: "Gujarat State Petronet Ltd",
    state: "Gujarat",
    awardValue: 20_000_000,
    awardDate: "2023-06-14",
    contractStart: "2023-07-01",
    expectedCompletion: "2024-06-30",
    status: AwardStatus.COMPLETED,
  },
  {
    referenceNo: "GEM/2025/B/XYZ/6618332",
    title: "Pump house works — contract cancelled",
    category: "Works",
    procuringOrg: "Delhi Development Authority",
    state: "Delhi",
    awardValue: 9_000_000,
    awardDate: "2025-05-02",
    contractStart: "2025-05-25",
    expectedCompletion: "2026-05-24",
    status: AwardStatus.CANCELLED,
  },
];

// ---------------------------------------------------------------------------
// PQR Technologies — critically over-committed (96% CRITICAL)
//   9 ACTIVE awards summing to ₹2.748 Cr; capacity ₹2.8625 Cr.
// ---------------------------------------------------------------------------

const pqrAwards: GemAwardSeed[] = [
  {
    referenceNo: "GEM/2025/B/PQR/7730055",
    title: "Facility management services — pump maintenance",
    category: "Services",
    procuringOrg: "Haryana Urban Development Authority",
    state: "Haryana",
    awardValue: 4_000_000,
    awardDate: "2025-09-19",
    contractStart: "2025-10-01",
    expectedCompletion: "2026-09-30",
    status: AwardStatus.ACTIVE,
  },
  {
    referenceNo: "GEM/2025/B/PQR/7732218",
    title: "O&M services — water treatment pumps",
    category: "Services",
    procuringOrg: "Public Health Engineering Dept, Haryana",
    state: "Haryana",
    awardValue: 3_800_000,
    awardDate: "2025-10-27",
    contractStart: "2025-11-15",
    expectedCompletion: "2026-11-14",
    status: AwardStatus.ACTIVE,
  },
  {
    referenceNo: "GEM/2025/B/PQR/7735640",
    title: "Annual servicing contract — booster pumps",
    category: "Services",
    procuringOrg: "Delhi Jal Board",
    state: "Delhi",
    awardValue: 3_500_000,
    awardDate: "2025-11-30",
    contractStart: "2025-12-15",
    expectedCompletion: "2026-12-14",
    status: AwardStatus.ACTIVE,
  },
  {
    referenceNo: "GEM/2026/B/PQR/7738991",
    title: "Supply of pump controllers & spares",
    category: "Goods",
    procuringOrg: "Haryana State Industrial Development Corp",
    state: "Haryana",
    awardValue: 3_200_000,
    awardDate: "2026-01-14",
    contractStart: "2026-02-01",
    expectedCompletion: "2026-12-31",
    status: AwardStatus.ACTIVE,
  },
  {
    referenceNo: "GEM/2026/B/PQR/7741203",
    title: "Manpower services — pumping station operations",
    category: "Services",
    procuringOrg: "Municipal Corporation of Gurugram",
    state: "Haryana",
    awardValue: 3_000_000,
    awardDate: "2026-02-20",
    contractStart: "2026-03-10",
    expectedCompletion: "2027-03-09",
    status: AwardStatus.ACTIVE,
  },
  {
    referenceNo: "GEM/2026/B/PQR/7744567",
    title: "Preventive maintenance — municipal pumps",
    category: "Services",
    procuringOrg: "Delhi Jal Board",
    state: "Delhi",
    awardValue: 2_800_000,
    awardDate: "2026-03-25",
    contractStart: "2026-04-10",
    expectedCompletion: "2027-04-09",
    status: AwardStatus.ACTIVE,
  },
  {
    referenceNo: "GEM/2026/B/PQR/7747882",
    title: "Supply of valves & pump fittings",
    category: "Goods",
    procuringOrg: "Haryana Urban Development Authority",
    state: "Haryana",
    awardValue: 2_600_000,
    awardDate: "2026-04-18",
    contractStart: "2026-05-05",
    expectedCompletion: "2027-01-31",
    status: AwardStatus.ACTIVE,
  },
  {
    referenceNo: "GEM/2026/B/PQR/7751044",
    title: "Repair & overhaul services — pump sets",
    category: "Services",
    procuringOrg: "Public Health Engineering Dept, Haryana",
    state: "Haryana",
    awardValue: 2_400_000,
    awardDate: "2026-05-29",
    contractStart: "2026-06-15",
    expectedCompletion: "2027-06-14",
    status: AwardStatus.ACTIVE,
  },
  {
    referenceNo: "GEM/2026/B/PQR/7754610",
    title: "Support services — SCADA for pumping network",
    category: "Services",
    procuringOrg: "Delhi Jal Board",
    state: "Delhi",
    awardValue: 2_180_000,
    awardDate: "2026-06-30",
    contractStart: "2026-07-20",
    expectedCompletion: "2027-07-19",
    status: AwardStatus.ACTIVE,
  },
  // --- Excluded from live exposure (proves filtering) ---------------------
  {
    referenceNo: "GEM/2024/B/PQR/7620331",
    title: "Pump maintenance services — contract completed",
    category: "Services",
    procuringOrg: "Haryana Urban Development Authority",
    state: "Haryana",
    awardValue: 5_000_000,
    awardDate: "2023-04-05",
    contractStart: "2023-05-01",
    expectedCompletion: "2024-04-30",
    status: AwardStatus.COMPLETED,
  },
  {
    referenceNo: "GEM/2024/B/PQR/7624119",
    title: "Supply of spare parts — order fulfilled",
    category: "Goods",
    procuringOrg: "Delhi Jal Board",
    state: "Delhi",
    awardValue: 4_500_000,
    awardDate: "2023-10-12",
    contractStart: "2023-11-01",
    expectedCompletion: "2024-10-31",
    status: AwardStatus.COMPLETED,
  },
  {
    referenceNo: "GEM/2025/B/PQR/7729887",
    title: "Facility services — terminated for default",
    category: "Services",
    procuringOrg: "Municipal Corporation of Gurugram",
    state: "Haryana",
    awardValue: 6_000_000,
    awardDate: "2025-03-08",
    contractStart: "2025-04-01",
    expectedCompletion: "2026-03-31",
    status: AwardStatus.CANCELLED,
  },
];

// ---------------------------------------------------------------------------

export const demoAwardBook: VendorAwardBook[] = [
  {
    bidderKey: "ABC",
    capacity: { turnover: 82_000_000, workforce: 180 },
    awards: abcAwards,
  },
  {
    bidderKey: "XYZ",
    capacity: { turnover: 34_000_000, workforce: 90 },
    awards: xyzAwards,
  },
  {
    bidderKey: "PQR",
    capacity: { turnover: 11_000_000, workforce: 40 },
    awards: pqrAwards,
  },
];

/** Convenience: look up one vendor's award book by demo key. */
export function awardBookForKey(bidderKey: string): VendorAwardBook | undefined {
  return demoAwardBook.find((b) => b.bidderKey === bidderKey);
}
