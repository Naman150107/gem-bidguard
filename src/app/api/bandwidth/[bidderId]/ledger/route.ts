import { NextResponse } from "next/server";
import { getAwardLedger } from "@/server/bandwidth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bandwidth/:bidderId/ledger — active vs excluded GeM award ledger.
 * Classification (ACTIVE vs COMPLETED/CANCELLED) is done by the deterministic
 * exposure engine; only ACTIVE awards contribute to live exposure.
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
    const ledger = await getAwardLedger(bidderId);
    return NextResponse.json(ledger, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[api/bandwidth/ledger]", message);
    if (/not found/i.test(message)) {
      return NextResponse.json({ error: "Bidder not found." }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Award ledger could not be loaded." },
      { status: 500 },
    );
  }
}
