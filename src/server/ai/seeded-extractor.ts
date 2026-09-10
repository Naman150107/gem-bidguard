import type { DocumentType as DocumentTypeT } from "../../lib/types";
import type {
  DocumentExtractor,
  ExtractedDocument,
  ExtractedProfile,
} from "./types";
import { buildProfile } from "./profile";
import { previewDocument } from "./document-preview";

/**
 * Seeded extractor — the default, deterministic path.
 *
 * It parses document text (the format used by the demo dataset, typical OCR
 * of Indian compliance certificates, and text extracted from uploaded PDFs)
 * with pure string logic. No network, no model, fully reproducible offline.
 * This is what makes the demo stable and the engine independently verifiable.
 *
 * Per-document field logic lives in `document-preview.ts` so the upload route
 * stores the exact same preview the pipeline later verifies with.
 *
 * The LLM extractor (llm-extractor.ts) is a drop-in replacement behind the same
 * DocumentExtractor interface for when a real model is configured.
 */
export const seededExtractor: DocumentExtractor = {
  mode: "seeded",
  async extract(docs): Promise<ExtractedProfile> {
    const extracted: ExtractedDocument[] = docs.map((d) => {
      const preview = previewDocument(d.type as DocumentTypeT, d.content, {
        issueDate: d.issueDate,
        expiryDate: d.expiryDate,
      });
      return {
        type: d.type as DocumentTypeT,
        fileName: d.fileName,
        fields: preview.fields,
        pan: preview.pan,
        gstin: preview.gstin,
        legalName: preview.legalName,
        address: preview.address,
        status: preview.status,
        issueDate: preview.issueDate,
        expiryDate: preview.expiryDate,
        confidence: preview.confidence,
      };
    });

    return buildProfile(extracted);
  },
};
