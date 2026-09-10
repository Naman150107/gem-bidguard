import { NextResponse } from "next/server";
import { getBandwidthOverview } from "@/server/bandwidth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bandwidth/overview — marketplace-level Radar data: every vendor's
 * live capacity exposure (computed by the deterministic engine from
 * server-side rows), sorted by exposure descending. Structured so a future
 * frontend can build the marketplace Radar without new endpoints.
 */
export async function GET() {
  try {
    const overview = await getBandwidthOverview();
    return NextResponse.json(overview, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/bandwidth/overview]", message);
    return NextResponse.json(
      { error: "Bandwidth overview could not be loaded." },
      { status: 500 },
    );
  }
}
