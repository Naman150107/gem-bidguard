"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DOC_TYPE_LABEL } from "@/lib/doc-labels";

/**
 * Buyer-side document upload.
 *
 * Posts multipart/form-data to POST /api/upload for an existing bidder. The API
 * validates size/MIME/type and stores the document (text inline) in the
 * database — no filesystem writes, so it works on serverless (Vercel). After a
 * successful upload it refreshes server data so the new document appears; the
 * officer then re-runs verification to fold it into the report.
 *
 * NOTE: the default "seeded" extractor reads the demo's labelled document text.
 * Plain-text uploads in that format are parsed; binary PDFs/images are stored
 * but only yield facts under the LLM extraction mode.
 */

// Mirrors UPLOAD_LIMITS in src/lib/config.ts. The server enforces the real
// limits regardless; these are only client-side hints.
const MAX_MB = 10;
const ACCEPT =
  ".pdf,.txt,.png,.jpg,.jpeg,application/pdf,text/plain,image/png,image/jpeg";

const DOC_TYPES = Object.entries(DOC_TYPE_LABEL) as [string, string][];

const controlClass =
  "flex h-9 w-full rounded-md border border-input bg-card px-3 py-1 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
  "focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";

export function DocumentUploader({ bidderId }: { bidderId: string }) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [type, setType] = React.useState<string>(DOC_TYPES[0]?.[0] ?? "");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function reset() {
    setError(null);
    setOk(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    reset();
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (!type) {
      setError("Select a document type.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File exceeds the ${MAX_MB} MB limit.`);
      return;
    }

    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("bidderId", bidderId);
      fd.append("type", type);

      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Upload failed.");
      }

      setOk(`Uploaded “${file.name}”. Re-run verification to include it.`);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <form
        onSubmit={submit}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1 space-y-1.5">
          <label
            htmlFor="doc-file"
            className="text-xs font-medium text-muted-foreground"
          >
            Document file
          </label>
          <input
            id="doc-file"
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              reset();
            }}
            className={
              "block w-full cursor-pointer rounded-md border border-input bg-card text-sm " +
              "text-muted-foreground file:mr-3 file:cursor-pointer file:border-0 " +
              "file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium " +
              "file:text-foreground hover:file:bg-accent focus-visible:outline-none " +
              "focus-visible:ring-2 focus-visible:ring-ring"
            }
          />
        </div>

        <div className="space-y-1.5 sm:w-56">
          <label
            htmlFor="doc-type"
            className="text-xs font-medium text-muted-foreground"
          >
            Document type
          </label>
          <select
            id="doc-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={controlClass}
          >
            {DOC_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <Button type="submit" disabled={loading || !file}>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {loading ? "Uploading…" : "Upload"}
        </Button>
      </form>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {ok && (
        <p className="inline-flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {ok}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Accepted: PDF, TXT, PNG, JPG · up to {MAX_MB} MB. Stored securely in the
        database; no files are written to disk.
      </p>
    </div>
  );
}
