import { NextResponse } from "next/server";
import { z } from "zod";
import { recordDecision } from "@/server/orchestrator";
import { getCurrentOfficer } from "@/lib/officer";
import { DecisionStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  runId: z.string().min(1),
  decision: z.enum([DecisionStatus.QUALIFIED, DecisionStatus.REJECTED]),
  note: z.string().max(2000).optional(),
});

/**
 * POST /api/decision — record the Procurement Officer's final QUALIFY/REJECT
 * decision for a run. This is the human-in-the-loop step; the AI never sets it.
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
    await recordDecision(parsed.data.runId, parsed.data.decision, {
      officer: officer.name,
      note: parsed.data.note,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Decision failed.";
    console.error("[api/decision]", message);
    return NextResponse.json(
      { error: "Decision could not be recorded." },
      { status: 500 },
    );
  }
}
