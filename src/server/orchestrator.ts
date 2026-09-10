import "server-only";
import { prisma } from "../lib/db";
import {
  AuditAction,
  RunStatus,
  DecisionStatus,
  ComplianceResult,
} from "../lib/types";
import type { ExtractionMode, DocumentType as DocumentTypeT } from "../lib/types";
import { getExtractor, resolveExtractionMode } from "./ai";
import { runAllProviders, indexResults } from "./providers/registry";
import { detectDiscrepancies } from "./engine/discrepancy";
import { evaluateRules } from "./engine/rules";
import { computeRisk } from "./engine/risk";
import { generateSummary } from "./summary";
import { recordAudit, recordAuditBatch, type AuditEntry } from "./audit";
import type {
  EngineRule,
  EngineRequirement,
  VerificationInput,
} from "./engine/types";

/**
 * Verification orchestrator — the single entry point that runs the full
 * decision-support pipeline for one bidder and persists a VerificationRun.
 *
 * Pipeline (each step audited):
 *   1. AI extraction of facts from documents (seeded or LLM)
 *   2. Government source checks (mock providers)
 *   3. Cross-source discrepancy detection (deterministic)
 *   4. Compliance rule evaluation (deterministic — decides PASS/FAIL/…)
 *   5. Weighted risk scoring (+ CRITICAL-fail gate)
 *   6. AI narration (summary + recommendation, decision-support only)
 *
 * The officer's QUALIFY/REJECT decision is recorded separately (recordDecision).
 */
export async function runVerification(
  bidderId: string,
  opts: { officer: string; mode?: ExtractionMode } = { officer: "system" },
): Promise<{ runId: string }> {
  const bidder = await prisma.bidder.findUnique({
    where: { id: bidderId },
    include: {
      documents: true,
      tender: { include: { requirements: true, rules: true } },
    },
  });
  if (!bidder) throw new Error(`Bidder ${bidderId} not found`);

  const officer = opts.officer;
  const mode = resolveExtractionMode(opts.mode);

  // Create the run up front so audit events can reference it.
  const run = await prisma.verificationRun.create({
    data: {
      bidderId: bidder.id,
      tenderId: bidder.tenderId,
      status: RunStatus.PENDING,
      extractionMode: mode,
    },
  });

  const audit: AuditEntry[] = [];
  const base = { runId: run.id, tenderId: bidder.tenderId, bidderId: bidder.id, officer };
  audit.push({ ...base, action: AuditAction.VERIFICATION_STARTED, result: mode });

  try {
    // 1. Extraction ---------------------------------------------------------
    const extractor = getExtractor(mode);
    const profile = await extractor.extract(
      bidder.documents.map((d) => ({
        type: d.type as DocumentTypeT,
        fileName: d.fileName,
        content: d.content,
        issueDate: d.issueDate ? d.issueDate.toISOString().slice(0, 10) : null,
        expiryDate: d.expiryDate ? d.expiryDate.toISOString().slice(0, 10) : null,
      })),
    );
    audit.push({
      ...base,
      action: AuditAction.DOCUMENT_EXTRACTED,
      result: `${profile.documents.length} document(s)`,
      aiConfidence: profile.confidence,
    });

    // 2. Government sources -------------------------------------------------
    const providerResults = await runAllProviders({
      pan: bidder.pan,
      gstin: bidder.gstin,
      cin: bidder.cin,
      udyamNumber: bidder.udyamNumber,
      legalName: bidder.legalName,
      name: bidder.name,
    });
    const providers = indexResults(providerResults);
    for (const pr of providerResults) {
      audit.push({
        ...base,
        action: AuditAction.SOURCE_VERIFIED,
        source: pr.source,
        result: pr.status,
        aiConfidence: pr.confidence,
      });
    }

    // 3. Build engine input + discrepancies ---------------------------------
    const requirements: EngineRequirement[] = bidder.tender.requirements.map((r) => ({
      code: r.code,
      title: r.title,
      mandatory: r.mandatory,
      category: r.category,
    }));
    const rules: EngineRule[] = bidder.tender.rules.map((r) => ({
      code: r.code,
      title: r.title,
      description: r.description,
      weightCategory: r.weightCategory as EngineRule["weightCategory"],
      severityOnFail: r.severityOnFail as EngineRule["severityOnFail"],
      config: (r.config as Record<string, unknown> | null) ?? null,
    }));

    const input: VerificationInput = {
      bidder: {
        name: bidder.name,
        legalName: bidder.legalName,
        pan: bidder.pan,
        gstin: bidder.gstin,
        cin: bidder.cin,
        udyamNumber: bidder.udyamNumber,
        address: bidder.address,
        declaredLocalContentPct: bidder.declaredLocalContentPct,
      },
      profile,
      providers,
      requirements,
      rules,
      presentDocumentTypes: bidder.documents.map((d) => d.type),
    };

    const discrepancies = detectDiscrepancies(input);
    for (const d of discrepancies) {
      audit.push({
        ...base,
        action: AuditAction.DISCREPANCY_DETECTED,
        result: d.kind,
        evidence: { severity: d.severity, description: d.description, sources: d.sources },
      });
    }

    // 4. Rules --------------------------------------------------------------
    const ruleResults = evaluateRules(input, discrepancies);
    for (const r of ruleResults) {
      audit.push({
        ...base,
        action: AuditAction.RULE_EVALUATED,
        rule: r.code,
        result: r.result,
        evidence: r.evidence,
      });
    }

    // 5. Risk ---------------------------------------------------------------
    const risk = computeRisk(ruleResults);
    audit.push({
      ...base,
      action: AuditAction.RISK_SCORED,
      result: `${risk.score} / ${risk.level}`,
      evidence: { breakdown: risk.breakdown, forcedCritical: risk.forcedCritical, forcedReason: risk.forcedReason },
    });

    // 6. Summary ------------------------------------------------------------
    const { summary, recommendation } = generateSummary(
      bidder.name,
      risk,
      ruleResults,
      discrepancies,
    );
    audit.push({
      ...base,
      action: AuditAction.AI_SUMMARY,
      result: risk.level,
      aiConfidence: profile.confidence,
    });

    // Persist everything in one transaction --------------------------------
    await prisma.$transaction([
      prisma.ruleResult.createMany({
        data: ruleResults.map((r) => ({
          runId: run.id,
          ruleCode: r.code,
          ruleTitle: r.title,
          category: r.weightCategory,
          result: r.result,
          detail: r.detail,
          evidence: (r.evidence as object) ?? undefined,
        })),
      }),
      prisma.finding.createMany({
        data: profile.findings.map((f) => ({
          runId: run.id,
          finding: f.finding,
          severity: f.severity,
          confidence: f.confidence,
          evidence: { code: f.code, document: f.affectedDocument ?? null } as unknown as object,
          affectedRequirement: f.affectedDocument,
          source: "AI_EXTRACTION",
        })),
      }),
      prisma.discrepancy.createMany({
        data: discrepancies.map((d) => ({
          runId: run.id,
          kind: d.kind,
          severity: d.severity,
          description: d.description,
          sources: d.sources as unknown as object,
        })),
      }),
      prisma.providerResult.createMany({
        data: providerResults.map((p) => ({
          runId: run.id,
          source: p.source,
          status: p.status,
          confidence: p.confidence,
          payload: p.payload as object,
          isMock: p.isMock,
        })),
      }),
      prisma.verificationRun.update({
        where: { id: run.id },
        data: {
          status: RunStatus.COMPLETED,
          complianceScore: risk.score,
          riskLevel: risk.level,
          decisionStatus: DecisionStatus.PENDING,
          summary,
          recommendation,
          scoreBreakdown: risk.breakdown as unknown as object,
          completedAt: new Date(),
        },
      }),
    ]);

    await recordAuditBatch(audit);
    return { runId: run.id };
  } catch (err) {
    await prisma.verificationRun.update({
      where: { id: run.id },
      data: { status: RunStatus.FAILED, completedAt: new Date() },
    });
    await recordAuditBatch(audit);
    throw err;
  }
}

/**
 * Record the Procurement Officer's final decision. This is the ONLY step that
 * sets QUALIFIED/REJECTED — never the AI or the engine.
 */
export async function recordDecision(
  runId: string,
  decision: typeof DecisionStatus.QUALIFIED | typeof DecisionStatus.REJECTED,
  opts: { officer: string; note?: string },
): Promise<void> {
  const run = await prisma.verificationRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`Run ${runId} not found`);

  await prisma.$transaction([
    prisma.officerDecision.upsert({
      where: { runId },
      create: { runId, officer: opts.officer, decision, note: opts.note },
      update: { officer: opts.officer, decision, note: opts.note, timestamp: new Date() },
    }),
    prisma.verificationRun.update({
      where: { id: runId },
      data: { decisionStatus: decision },
    }),
  ]);

  await recordAudit({
    runId,
    tenderId: run.tenderId,
    bidderId: run.bidderId,
    officer: opts.officer,
    action: AuditAction.OFFICER_DECISION,
    decision,
    result: decision,
    evidence: opts.note ? { note: opts.note } : undefined,
  });
}
