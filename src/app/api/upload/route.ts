import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { UPLOAD_LIMITS } from "@/lib/config";
import { DocumentType } from "@/lib/types";
import { getCurrentOfficer } from "@/lib/officer";

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
 * validates metadata with Zod. Text content is stored inline (stands in for an
 * OCR/parse step); binary types are accepted but their text is left for the
 * extraction step. No secrets are logged.
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
  const isText = !file.type || file.type.startsWith("text/");
  const content = isText
    ? (await file.text()).slice(0, 200_000)
    : `[Binary ${file.type} document "${fileName}" — ${file.size} bytes. Text extraction pending.]`;

  const doc = await prisma.document.create({
    data: {
      bidderId: bidder.id,
      type: meta.data.type,
      fileName,
      mimeType: file.type || "text/plain",
      content,
      status: "UPLOADED",
    },
    select: { id: true, fileName: true, type: true },
  });

  // Attribution only; officer identity is not sensitive.
  const officer = getCurrentOfficer();
  console.log(`[api/upload] ${officer.id} uploaded ${doc.type} for bidder ${bidder.id}`);

  return NextResponse.json({ document: doc }, { status: 201 });
}
