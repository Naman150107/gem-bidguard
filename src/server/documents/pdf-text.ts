/**
 * Server-only PDF text extraction.
 *
 * Uses `pdf-parse` (a small text-extraction utility — not a framework, queue,
 * OCR service, or any new infrastructure) to turn an uploaded PDF buffer into
 * usable text for the existing AI extraction path.
 *
 * All failures are graceful: invalid/empty PDFs resolve to an empty string
 * with an `error` note instead of throwing, so the upload route can store a
 * clearly-marked placeholder and the verification pipeline keeps working
 * (low-confidence document → deterministic rules decide).
 */

export interface PdfExtractionResult {
  /** Usable text, trimmed and capped. Empty when nothing could be read. */
  text: string;
  pages: number;
  /** True when no usable text was found. */
  empty: boolean;
  /** Human-readable note when extraction failed or found nothing. */
  error?: string;
}

/** Upper bound stored per document (matches the inline-text cap). */
export const MAX_PDF_CHARS = 200_000;

/** Minimum non-whitespace characters to count as "usable text". */
const MIN_USABLE_CHARS = 20;

export function looksLikePdf(
  buf: Buffer,
  fileName: string,
  mimeType: string,
): boolean {
  if (mimeType === "application/pdf") return true;
  if (fileName.toLowerCase().endsWith(".pdf")) return true;
  if (buf.length >= 4 && buf.subarray(0, 4).toString("ascii") === "%PDF") return true;
  return false;
}

/** Collapse control chars but keep newlines so "Label: value" parsing works. */
function cleanText(raw: string): string {
  return (
    raw
      // Strip null bytes and most control chars (keep \n \r \t).
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      // Collapse 3+ blank lines.
      .replace(/\n{4,}/g, "\n\n\n")
      .trim()
  );
}

export async function extractPdfText(
  buf: Buffer,
): Promise<PdfExtractionResult> {
  if (buf.length === 0) {
    return { text: "", pages: 0, empty: true, error: "Empty file." };
  }
  // Quick magic-byte check so non-PDF bytes get a clear message.
  const header = buf.subarray(0, 5).toString("ascii");
  if (header !== "%PDF-") {
    return {
      text: "",
      pages: 0,
      empty: true,
      error: "Not a PDF file (missing %PDF header).",
    };
  }

  try {
    // Dynamic import of the inner module (NOT the package root: its index.js
    // runs a debug file-read when loaded as ESM). pdf-parse is server-only
    // (see next.config.mjs serverComponentsExternalPackages) and loads from
    // node_modules at runtime instead of being bundled.
    const mod = (await import("pdf-parse/lib/pdf-parse.js")) as unknown as
      | { default: (data: Uint8Array) => Promise<{ text: string; numpages: number }> }
      | ((data: Uint8Array) => Promise<{ text: string; numpages: number }>);
    const pdfParse =
      typeof mod === "function" ? mod : (mod as { default: (data: Uint8Array) => Promise<{ text: string; numpages: number }> }).default;
    // Copy out of Node's shared Buffer pool: the bundled pdf.js reads the
    // backing ArrayBuffer and would otherwise alias consecutive small files,
    // returning a previous document's text for a later upload.
    const data = await pdfParse(Uint8Array.from(buf));
    const text = cleanText(data.text ?? "").slice(0, MAX_PDF_CHARS);
    if (text.replace(/\s+/g, "").length < MIN_USABLE_CHARS) {
      return {
        text: "",
        pages: data.numpages ?? 0,
        empty: true,
        error:
          "No extractable text found (scanned image or empty PDF). Officer should verify manually.",
      };
    }
    return { text, pages: data.numpages ?? 0, empty: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "PDF parse failed.";
    return {
      text: "",
      pages: 0,
      empty: true,
      error: `Could not read PDF (${message}). Officer should verify manually.`,
    };
  }
}
