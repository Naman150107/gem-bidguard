import type { DocumentType as DocumentTypeT } from "../../lib/types";
import type {
  DocumentExtractor,
  ExtractedDocument,
  ExtractedProfile,
  ExtractionFinding,
} from "./types";
import { buildProfile } from "./profile";
import { llmExtractionSchema } from "./schema";

/**
 * LLM extractor — real-model path behind the same DocumentExtractor interface.
 *
 * It calls an OpenAI-compatible chat-completions endpoint (configurable, so it
 * works with OpenAI, Azure OpenAI, or a local gateway) and asks for STRUCTURED
 * JSON that we validate with Zod. The model only EXTRACTS and DESCRIBES; all
 * compliance interpretation still happens in the deterministic engine.
 *
 * Configured entirely via env (never hard-coded secrets):
 *   LLM_API_KEY    - required to enable this path
 *   LLM_BASE_URL   - default https://api.openai.com/v1
 *   LLM_MODEL      - default gpt-4o-mini
 *
 * If the key is absent or the call fails, the orchestrator falls back to the
 * seeded extractor, so the app always works offline.
 */

const SYSTEM_PROMPT = `You are a document-extraction assistant for a government procurement compliance tool.
You will receive the raw text of bidder documents.
Your ONLY job is to EXTRACT and DESCRIBE facts. You MUST NOT decide whether the bidder is compliant, qualified, or should be rejected.
For each document, return the labeled fields you can read (as a "fields" object with lowercase keys), plus any of these when present: pan, gstin, legalName, address, status, issueDate (YYYY-MM-DD), expiryDate (YYYY-MM-DD), and a confidence in [0,1].
You may add advisory "findings" (observations a human reviewer should check), each with a severity of CRITICAL|HIGH|MEDIUM|LOW|INFO. Findings are descriptive only.
Respond with ONLY a JSON object matching the requested schema. No prose.`;

export function isLlmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY);
}

interface DocInput {
  type: DocumentTypeT;
  fileName: string;
  content: string;
  issueDate?: string | null;
  expiryDate?: string | null;
}

async function callLlm(docs: DocInput[]): Promise<unknown> {
  const baseUrl = process.env.LLM_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY not set");

  const userPayload = {
    instruction:
      "Extract fields from each document. Return JSON: { documents: [...], findings: [...] }.",
    documents: docs.map((d) => ({
      fileName: d.fileName,
      type: d.type,
      text: d.content,
    })),
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`LLM request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM returned empty content");
    return JSON.parse(content);
  } finally {
    clearTimeout(timeout);
  }
}

export const llmExtractor: DocumentExtractor = {
  mode: "llm",
  async extract(docs): Promise<ExtractedProfile> {
    const raw = await callLlm(docs as DocInput[]);
    const parsed = llmExtractionSchema.parse(raw);

    // Re-associate the model output with the known document types by fileName.
    const typeByName = new Map(docs.map((d) => [d.fileName, d.type]));
    const extracted: ExtractedDocument[] = parsed.documents.map((d) => ({
      type: (typeByName.get(d.fileName) ?? docs[0]?.type) as DocumentTypeT,
      fileName: d.fileName,
      fields: d.fields,
      pan: d.pan,
      gstin: d.gstin,
      legalName: d.legalName,
      address: d.address,
      status: d.status,
      issueDate: d.issueDate,
      expiryDate: d.expiryDate,
      confidence: d.confidence,
    }));

    const profile = buildProfile(extracted);
    // Merge the model's advisory findings with the deterministic ones.
    const modelFindings: ExtractionFinding[] = parsed.findings.map((f) => ({
      code: f.code,
      severity: f.severity,
      finding: f.finding,
      confidence: f.confidence,
      affectedDocument: f.affectedDocument,
    }));
    return { ...profile, findings: [...modelFindings, ...profile.findings] };
  },
};
