import { NextResponse } from "next/server";
import { simulateBandwidthAward } from "@/server/bandwidth";
import { getCurrentOfficer } from "@/lib/officer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/bandwidth/:bidderId/simulate — what-if award simulation.
 * Body: { proposedValue, proposedDurationMonths?, proposedCategory?,
 *         proposedState? }. Capacity is always read from the server-side
 * database; the client supplies ONLY the proposed award. Pure — it never
 * mutates stored awards. Simulation inputs are validated (see
 * simulationInputSchema in the bandwidth service).
 */
export async function POST(
  request: Request,
  { params }: { params: { bidderId: string } },
) {
  const bidderId = params.bidderId?.trim();
  if (!bidderId) {
    return NextResponse.json({ error: "Missing bidder id." }, { status: 400 });
  }
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const officer = getCurrentOfficer();
  try {
    const result = await simulateBandwidthAward(bidderId, json, {
      officer: officer.name,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/bandwidth/simulate]", message);
    const status = (err as { status?: number }).status;
    const details = (err as { details?: unknown }).details;
    if (status === 400) {
      return NextResponse.json(
        { error: "Invalid simulation input.", details },
        { status: 400 },
      );
    }
    if (/not found|no server-side capacity/i.test(message)) {
      return NextResponse.json(
        { error: "Bidder or capacity profile not found." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { error: "Award simulation could not be completed." },
      { status: 500 },
    );
  }
}
