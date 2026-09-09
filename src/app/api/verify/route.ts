import { NextResponse } from "next/server";
import { z } from "zod";
import { runVerification } from "@/server/orchestrator";
import { getCurrentOfficer } from "@/lib/officer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  bidderId: z.string().min(1),
  mode: z.enum(["seeded", "llm"]).optional(),
});

/**
 * POST /api/verify — run the decision-support verification pipeline for a
 * bidder. Returns the created run id. The AI/engine only produces a
 * recommendation; the officer's decision is a separate action.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const officer = getCurrentOfficer();
  try {
    const { runId } = await runVerification(parsed.data.bidderId, {
      officer: officer.name,
      mode: parsed.data.mode,
    });
    return NextResponse.json({ runId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed.";
    // Do not leak internals; log server-side only.
    console.error("[api/verify]", message);
    return NextResponse.json(
      { error: "Verification could not be completed." },
      { status: 500 },
    );
  }
}
