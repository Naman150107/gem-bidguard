import { NextResponse } from "next/server";
import { recalculateBandwidth } from "@/server/bandwidth";
import { getCurrentOfficer } from "@/lib/officer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bandwidth/:bidderId/recalculate — recompute exposure from
 * server-side database rows via the deterministic engine and persist a fresh
 * BandwidthAssessment snapshot. Capacity never comes from the client.
 */
export async function POST(
  _request: Request,
  { params }: { params: { bidderId: string } },
) {
  const bidderId = params.bidderId?.trim();
  if (!bidderId) {
    return NextResponse.json({ error: "Missing bidder id." }, { status: 400 });
  }
  const officer = getCurrentOfficer();
  try {
    const result = await recalculateBandwidth(bidderId, {
      officer: officer.name,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/bandwidth/recalculate]", message);
    if (/not found|no server-side capacity/i.test(message)) {
      return NextResponse.json(
        { error: "Bidder or capacity profile not found." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Bandwidth assessment could not be recalculated." },
      { status: 500 },
    );
  }
}
