import type {
  DocumentType as DocumentTypeT,
  Severity as SeverityT,
} from "../../lib/types";

/**
 * Facts extracted from a single bidder document. All fields are optional —
 * extraction is best-effort and the rules engine decides what a missing field
 * means. Raw label/value pairs are preserved for evidence and audit.
 */
export interface ExtractedDocument {
  type: DocumentTypeT;
  fileName: string;
  /** Parsed "Label: value" pairs, keys normalized to lowercase. */
  fields: Record<string, string>;
  /** Identity/eligibility facts pulled from fields, where present. */
  pan?: string;
  gstin?: string;
  legalName?: string;
  address?: string;
  status?: string;
  issueDate?: string;
  expiryDate?: string;
  /** Extractor confidence for this document, 0..1. */
  confidence: number;
}

/**
 * A single observation the AI surfaces for officer review. Findings are
 * DESCRIPTIVE ONLY — they never assert a compliance decision. The deterministic
 * rules engine consumes the underlying facts, not these strings.
 */
export interface ExtractionFinding {
  code: string;
  severity: SeverityT;
  finding: string;
  confidence: number;
  affectedDocument?: string;
}

/**
 * Aggregated, engine-ready view of a bidder derived from their documents.
 * Numbers are parsed once here so rule handlers stay simple and deterministic.
 */
export interface ExtractedProfile {
  documents: ExtractedDocument[];
  findings: ExtractionFinding[];

  // Declared identity (from bidder-submitted docs).
  declaredPan?: string;
  declaredGstin?: string;
  declaredName?: string;
  declaredAddress?: string;

  // Eligibility facts.
  avgAnnualTurnoverCr?: number;
  localContentPct?: number;
  similarOrders?: number;
  emdPaidInr?: number;
  emdExemptionClaimed?: boolean;
  oemValidUpto?: string;
  oemStatusText?: string;

  /** What the bidder declared about debarment (true = declared debarred). */
  declaredDebarred?: boolean;

  /** Overall mean extraction confidence, 0..1. */
  confidence: number;
}

export type ExtractionMode = "seeded" | "llm";

/**
 * The extraction contract. `seeded` and `llm` implementations are
 * interchangeable — the orchestrator depends only on this interface.
 */
export interface DocumentExtractor {
  readonly mode: ExtractionMode;
  extract(
    docs: { type: DocumentTypeT; fileName: string; content: string; issueDate?: string | null; expiryDate?: string | null }[],
  ): Promise<ExtractedProfile>;
}
