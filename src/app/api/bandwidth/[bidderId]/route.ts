import { NextResponse } from "next/server";
import { getBandwidthAssessment } from "@/server/bandwidth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bandwidth/:bidderId — current Bandwidth Radar assessment.
 * Capacity-exposure signal only; independent of the compliance pipeline.
 */
export async function GET(
  _request: Request,
  { params }: { params: { bidderId: string } },
) {
  const bidderId = params.bidderId?.trim();
  if (!bidderId) {
    return NextResponse.json({ error: "Missing bidder id." }, { status: 400 });
  }
  try {
    const assessment = await getBandwidthAssessment(bidderId);
    return NextResponse.json(assessment, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/bandwidth]", message);
    if (/not found/i.test(message)) {
      return NextResponse.json({ error: "Bidder not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Bandwidth assessment could not be loaded." },
      { status: 500 },
    );
  }
}
