import { z } from "zod";

/**
 * Structured-output schema the LLM must return. Kept intentionally close to a
 * flat "fields" bag plus a few typed facts, so the model does the reading and
 * our deterministic code (profile.ts) does the interpreting.
 *
 * The model is instructed to EXTRACT and DESCRIBE only — never to decide
 * compliance. Findings are advisory notes for the officer.
 */
export const llmDocumentSchema = z.object({
  fileName: z.string(),
  fields: z.record(z.string()).default({}),
  pan: z.string().optional(),
  gstin: z.string().optional(),
  legalName: z.string().optional(),
  address: z.string().optional(),
  status: z.string().optional(),
  issueDate: z.string().optional(),
  expiryDate: z.string().optional(),
  confidence: z.number().min(0).max(1).default(0.8),
});

export const llmFindingSchema = z.object({
  code: z.string(),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]),
  finding: z.string(),
  confidence: z.number().min(0).max(1).default(0.7),
  affectedDocument: z.string().optional(),
});

export const llmExtractionSchema = z.object({
  documents: z.array(llmDocumentSchema),
  findings: z.array(llmFindingSchema).default([]),
});

export type LlmExtraction = z.infer<typeof llmExtractionSchema>;
