import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { UPLOAD_LIMITS } from "@/lib/config";
import { DocumentType } from "@/lib/types";
import type { DocumentType as DocumentTypeT } from "@/lib/types";
import { getCurrentOfficer } from "@/lib/officer";
import {
  extractPdfText,
  looksLikePdf,
} from "@/server/documents/pdf-text";
import { previewDocument } from "@/server/ai/document-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const docTypes = Object.values(DocumentType) as [string, ...string[]];

const metaSchema = z.object({
  bidderId: z.string().min(1),
  type: z.enum(docTypes),
});

/** Strip path separators and control chars from a client-supplied filename. */
function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "document";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 128) || "document";
}

/**
 * POST /api/upload — accept a bidder document (multipart/form-data).
 *
 * MVP security: enforces size + MIME allow-list, sanitizes the filename, and
 * validates metadata with Zod. PDFs are parsed to usable text (pdf-parse) so
 * the existing extraction → discrepancy → rules pipeline verifies the real
 * file content; text files are stored inline. Image binaries are accepted but
 * still need OCR/manual review (no OCR in this MVP). Invalid/empty PDFs are
 * stored with a clearly-marked placeholder and low extraction confidence
 * instead of failing the upload. Deterministic field previews and confidence
 * are stored on the Document row and returned for immediate UI display. No
 * secrets are logged.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const meta = metaSchema.safeParse({
    bidderId: form.get("bidderId"),
    type: form.get("type"),
  });
  if (!meta.success) {
    return NextResponse.json(
      { error: "Invalid metadata.", details: meta.error.flatten() },
      { status: 400 },
    );
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (file.size > UPLOAD_LIMITS.maxBytes) {
    return NextResponse.json(
      { error: `File exceeds ${UPLOAD_LIMITS.maxBytes / (1024 * 1024)} MB limit.` },
      { status: 413 },
    );
  }
  if (file.type && !UPLOAD_LIMITS.allowedMimeTypes.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}.` },
      { status: 415 },
    );
  }

  const bidder = await prisma.bidder.findUnique({
    where: { id: meta.data.bidderId },
    select: { id: true },
  });
  if (!bidder) {
    return NextResponse.json({ error: "Bidder not found." }, { status: 404 });
  }

  const fileName = sanitizeFileName(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";

  // Process the uploaded file — PDFs are parsed to usable text so the
  // seeded/LLM extraction path verifies real content, not a placeholder.
  let content: string;
  let warning: string | undefined;
  if (looksLikePdf(buffer, file.name, file.type)) {
    const pdf = await extractPdfText(buffer);
    if (!pdf.empty) {
      content = pdf.text;
    } else {
      warning =
        pdf.error ??
        "No extractable text found. Officer should verify manually.";
      content =
        `[Unparseable PDF document "${fileName}" — ${file.size} bytes. ` +
        `${warning}]`;
    }
  } else if (!file.type || file.type.startsWith("text/")) {
    const text = (await file.text()).trim();
    if (text.length === 0) {
      warning = "Empty text file. Officer should verify manually.";
      content =
        `[Empty text document "${fileName}". No extractable text found. ` +
        `Officer should verify manually.]`;
    } else {
      content = text.slice(0, 200_000);
    }
  } else {
    warning =
      "Image/binary upload stored without OCR. Officer should verify manually; re-upload as PDF or text for automatic extraction.";
    content =
      `[Binary ${mimeType} document "${fileName}" — ${file.size} bytes. ` +
      `Text extraction pending (no OCR in this MVP).]`;
  }

  // Deterministic preview with the same logic the pipeline uses, so what the
  // bidder page shows is what verification will check.
  const preview = previewDocument(meta.data.type as DocumentTypeT, content);
  const extractedFields = {
    fields: preview.fields,
    ...(preview.pan ? { pan: preview.pan } : {}),
    ...(preview.gstin ? { gstin: preview.gstin } : {}),
    ...(preview.legalName ? { legalName: preview.legalName } : {}),
    ...(preview.address ? { address: preview.address } : {}),
    ...(preview.status ? { status: preview.status } : {}),
  };

  const doc = await prisma.document.create({
    data: {
      bidderId: bidder.id,
      type: meta.data.type,
      fileName,
      mimeType: file.type || "text/plain",
      content,
      status: "UPLOADED",
      extractedFields,
      extractionConfidence: preview.confidence,
    },
    select: { id: true, fileName: true, type: true },
  });

  // Attribution only; officer identity is not sensitive.
  const officer = getCurrentOfficer();
  console.log(`[api/upload] ${officer.id} uploaded ${doc.type} for bidder ${bidder.id}`);

  return NextResponse.json(
    {
      document: doc,
      extraction: {
        fields: preview.fields,
        pan: preview.pan ?? null,
        gstin: preview.gstin ?? null,
        legalName: preview.legalName ?? null,
        address: preview.address ?? null,
        confidence: preview.confidence,
      },
      ...(warning ? { warning } : {}),
    },
    { status: 201 },
  );
}
