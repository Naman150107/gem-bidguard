import type { DocumentType as DocumentTypeT } from "../../lib/types";
import type {
  DocumentExtractor,
  ExtractedDocument,
  ExtractedProfile,
} from "./types";
import { buildProfile } from "./profile";
import {
  extractGstin,
  extractPan,
  parseFields,
  pick,
} from "./parse";

/**
 * Seeded extractor — the default, deterministic path.
 *
 * It parses the labeled document text (the format used by the demo dataset and
 * typical OCR of Indian compliance certificates) with pure string logic. No
 * network, no model, fully reproducible offline. This is what makes the demo
 * stable and the engine independently verifiable.
 *
 * The LLM extractor (llm-extractor.ts) is a drop-in replacement behind the same
 * DocumentExtractor interface for when a real model is configured.
 */
export const seededExtractor: DocumentExtractor = {
  mode: "seeded",
  async extract(docs): Promise<ExtractedProfile> {
    const extracted: ExtractedDocument[] = docs.map((d) => {
      const fields = parseFields(d.content);
      const panText = pick(fields, "pan");
      const gstinText = pick(fields, "gstin");
      return {
        type: d.type as DocumentTypeT,
        fileName: d.fileName,
        fields,
        pan: extractPan(panText) ?? extractPan(d.content),
        gstin: extractGstin(gstinText) ?? extractGstin(d.content),
        legalName:
          pick(fields, "legal name", "name of enterprise", "name") ?? undefined,
        address: pick(fields, "address", "registered address") ?? undefined,
        status: pick(fields, "status") ?? undefined,
        issueDate: d.issueDate ?? pick(fields, "date of registration") ?? undefined,
        expiryDate: d.expiryDate ?? pick(fields, "valid upto") ?? undefined,
        // Seeded documents are clean text: high, stable confidence.
        confidence: 0.98,
      };
    });

    return buildProfile(extracted);
  },
};
