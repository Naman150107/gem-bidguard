import type { ExtractionMode } from "../../lib/types";
import type { DocumentExtractor } from "./types";
import { seededExtractor } from "./seeded-extractor";
import { llmExtractor, isLlmConfigured } from "./llm-extractor";

/**
 * Choose the extractor. Default is the deterministic seeded extractor. The LLM
 * extractor is used only when a mode of "llm" is requested AND an API key is
 * configured; otherwise we fall back to seeded so the app always works offline.
 */
export function getExtractor(mode?: ExtractionMode): DocumentExtractor {
  if (mode === "llm" && isLlmConfigured()) return llmExtractor;
  return seededExtractor;
}

export function resolveExtractionMode(requested?: ExtractionMode): ExtractionMode {
  return requested === "llm" && isLlmConfigured() ? "llm" : "seeded";
}

export { seededExtractor, llmExtractor, isLlmConfigured };
export type { DocumentExtractor };
