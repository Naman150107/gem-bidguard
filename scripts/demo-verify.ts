/**
 * Runs the full verification pipeline (via the orchestrator) for every seeded
 * bidder and persists the runs to the database. Use after `npm run db:seed` so
 * the dashboard, bidder, and verification pages have data to show.
 *
 * Run: npm run demo:verify
 *
 * Requires DATABASE_URL to be set (PostgreSQL). This is the DB-backed companion
 * to `npm run verify:engines`, which exercises the same engines without a DB.
 */
import { prisma } from "../src/lib/db";
import { runVerification } from "../src/server/orchestrator";
import { getCurrentOfficer } from "../src/lib/officer";

async function main() {
  const officer = getCurrentOfficer();
  const bidders = await prisma.bidder.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (bidders.length === 0) {
    console.log("No bidders found. Run `npm run db:seed` first.");
    return;
  }

  console.log(`Running verification for ${bidders.length} bidder(s) as "${officer.name}"...\n`);

  for (const b of bidders) {
    try {
      const { runId } = await runVerification(b.id, { officer: officer.name });
      const run = await prisma.verificationRun.findUnique({
        where: { id: runId },
        select: { complianceScore: true, riskLevel: true },
      });
      console.log(
        `  ✔ ${b.name}: score=${run?.complianceScore} risk=${run?.riskLevel}`,
      );
    } catch (err) {
      console.error(`  ✗ ${b.name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log("\nDone. Open the dashboard to review results.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
