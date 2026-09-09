/**
 * Offline engine verification. Runs the REAL extraction, provider, discrepancy,
 * rules, and risk modules against the seeded dataset — no DB, no network — and
 * asserts each bidder lands in its intended risk band.
 *
 * Run: npm run verify:engines
 */
import { seededExtractor } from "../src/server/ai/seeded-extractor";
import { runAllProviders, indexResults } from "../src/server/providers/registry";
import { detectDiscrepancies } from "../src/server/engine/discrepancy";
import { evaluateRules } from "../src/server/engine/rules";
import { computeRisk } from "../src/server/engine/risk";
import { demoDataset } from "../src/data/demo";
import type {
  EngineRequirement,
  EngineRule,
  VerificationInput,
} from "../src/server/engine/types";

const EXPECTED: Record<string, string> = {
  ABC: "LOW",
  XYZ: "MODERATE",
  PQR: "CRITICAL",
};

const requirements = demoDataset.requirements.map((r) => ({
  code: r.code,
  title: r.title,
  mandatory: r.mandatory,
  category: r.category,
}));

const rules: EngineRule[] = demoDataset.rules.map((r) => ({
  code: r.code,
  title: r.title,
  description: r.description,
  weightCategory: r.weightCategory,
  severityOnFail: r.severityOnFail,
  config: r.config ?? null,
}));

let allPass = true;

for (const b of demoDataset.bidders) {
  const profile = await seededExtractor.extract(
    b.documents.map((d) => ({
      type: d.type,
      fileName: d.fileName,
      content: d.content,
      issueDate: d.issueDate,
      expiryDate: d.expiryDate,
    })),
  );

  const providerResults = await runAllProviders({
    bidderKey: b.key,
    pan: b.pan,
    gstin: b.gstin,
    cin: b.cin,
    udyamNumber: b.udyamNumber,
    legalName: b.legalName,
    name: b.name,
  });
  const providers = indexResults(providerResults);

  const input: VerificationInput = {
    bidder: {
      name: b.name,
      legalName: b.legalName,
      pan: b.pan,
      gstin: b.gstin,
      cin: b.cin,
      udyamNumber: b.udyamNumber,
      address: b.address,
      declaredLocalContentPct: b.declaredLocalContentPct,
    },
    profile,
    providers,
    requirements,
    rules,
    presentDocumentTypes: b.documents.map((d) => d.type),
  };

  const discrepancies = detectDiscrepancies(input);
  const ruleResults = evaluateRules(input, discrepancies);
  const risk = computeRisk(ruleResults);

  const ok = risk.level === EXPECTED[b.key];
  if (!ok) allPass = false;

  const fails = ruleResults.filter((r) => r.result === "FAIL").map((r) => r.code);
  const warns = ruleResults.filter((r) => r.result === "WARNING").map((r) => r.code);

  console.log(
    `\n${ok ? "PASS" : "FAIL"}  ${b.key}  score=${risk.score} level=${risk.level} (expected ${EXPECTED[b.key]})${risk.forcedCritical ? " [forced CRITICAL]" : ""}`,
  );
  console.log(`      discrepancies: ${discrepancies.length} | FAIL: [${fails.join(", ")}] | WARN: [${warns.join(", ")}]`);
  console.log(
    "      breakdown: " +
      risk.breakdown
        .map((c) => `${c.category}=${c.ratio === null ? "n/a" : (c.ratio * 100).toFixed(0) + "%"}(${c.points.toFixed(1)}pt)`)
        .join("  "),
  );
}

console.log(`\n${allPass ? "✔ ALL BIDDERS MATCH EXPECTED RISK LEVELS" : "�’ MISMATCH — see above"}`);
if (!allPass) process.exit(1);
