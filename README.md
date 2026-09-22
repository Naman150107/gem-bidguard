# VendorPulse AI

**AI-Powered Integrated Bid Compliance Verification Platform for GeM Procurement**
Smart India Hackathon 2026 — Problem Statement 26100

VendorPulse AI is a decision-support tool for Government e-Marketplace (GeM)
procurement officers. It ingests a bidder's submitted documents, cross-checks
them against (mock) government registries, runs a **deterministic** compliance
engine, computes a weighted risk score, and produces a plain-language summary
with a recommendation. The **Procurement Officer makes the final
QUALIFY / REJECT decision** — the AI never does.

> **The AI is decision-support only.** The language model extracts facts from
> documents and explains findings. It does **not** decide compliance. Every
> PASS / FAIL / WARNING outcome is produced by deterministic rules in code, and
> the final qualification decision always rests with a human officer. This
> disclaimer is shown wherever a result or recommendation appears in the UI.

---

## What it does

1. **AI extraction** — reads bidder documents (GST certificate, PAN, Udyam, ITR,
   OEM authorization, EPFO/ESIC, bid declaration, etc.) and extracts structured
   facts (identifiers, turnover, local-content %, EMD, expiry dates).
2. **Government source checks** — queries nine registries (GST, PAN, Udyam/MSME,
   MCA, EPFO, ESIC, Startup India, NSIC, Debarment) for authoritative records.
   *These are **mock** providers reading seeded demo data — not live government
   integrations.* Each is a clean drop-in point for a real authorized API.
3. **Discrepancy detection** — deterministically compares declared data,
   document contents, and government records (PAN/GSTIN/name/address mismatches,
   conflicting debarment declarations, inactive GST, etc.).
4. **Compliance evaluation** — deterministic rules produce
   PASS / FAIL / WARNING / PENDING per requirement. **This is the only place
   compliance is decided.**
5. **Risk scoring** — a weighted score (0–100) across four categories maps to a
   risk band (LOW / MODERATE / HIGH / CRITICAL). A failed CRITICAL-severity
   check (e.g. active debarment) forces CRITICAL regardless of the numeric score.
6. **AI summary & recommendation** — a human-readable narration of what the
   engine found, plus a recommended course of action (advisory only).
7. **Officer decision + audit trail** — the officer records QUALIFY / REJECT;
   every step is written to an append-only audit log.

### Scoring model (configurable)

| Category                    | Weight |
| --------------------------- | ------ |
| Mandatory tender requirements | 50%  |
| Statutory compliance          | 25%  |
| Document validity             | 15%  |
| Cross-source consistency      | 10%  |

Risk bands: **90–100 LOW · 75–89 MODERATE · 50–74 HIGH · <50 CRITICAL**.
All weights, per-result contributions, and thresholds live in
[`src/lib/config.ts`](src/lib/config.ts).

---

## Tech stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **Tailwind CSS** with a small, hand-rolled shadcn/ui-style component set
  (no Radix dependency)
- **Recharts** for the risk-distribution chart
- **Prisma** ORM → **PostgreSQL** (Supabase)
- **Zod** for input validation
- Pluggable LLM extraction over any **OpenAI-compatible** endpoint

Intentionally **no** microservices, Kubernetes, Kafka, Redis, or Elasticsearch —
a single Next.js app with a Postgres database.

---

## Getting started

### Prerequisites

- Node.js ≥ 18.18
- A PostgreSQL database (a free [Supabase](https://supabase.com) project works well)

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `DATABASE_URL` and `DIRECT_URL` from your Supabase project
(Settings → Database → Connection string). Leave `EXTRACTION_MODE="seeded"` for
a fully offline, API-key-free demo.

### 3. Set up the database

```bash
npm run db:generate   # generate the Prisma client
npm run db:push       # create tables
npm run db:seed       # load the demo tender + 3 bidders + documents
```

Or in one step: `npm run db:reset` (force-resets the schema, then reseeds).

### 4. Generate verification runs (optional but recommended)

```bash
npm run demo:verify
```

This runs the full pipeline for all three seeded bidders so the dashboard,
bidder, and verification pages have data on first load. You can also click
**Run verification** on any bidder page.

### 5. Run the app

```bash
npm run dev
```

Open <http://localhost:3000> — it redirects to `/dashboard`.

---

## Screens

| Route                 | Purpose                                                          |
| --------------------- | ---------------------------------------------------------------- |
| `/dashboard`          | Portfolio overview: stats, risk distribution, recent activity    |
| `/tenders`            | List of tenders                                                  |
| `/tenders/[id]`       | Tender detail: requirements, compliance rules, participating bidders |
| `/bidders/[id]`       | Bidder identity, documents, latest verification summary          |
| `/verification/[id]`  | Full report: score, breakdown, checks, sources, findings, discrepancies, **officer decision**, audit trail |
| `/audit`              | Global, filterable append-only audit log                         |

---

## Demo data

Three bidders are engineered to exercise the engine end-to-end and land in three
distinct risk bands. **The outcomes are not hard-coded** — they emerge from the
deterministic rules evaluating the seeded data:

- **ABC Engineering Pvt Ltd** → **LOW** (score 100): fully compliant.
- **XYZ Manufacturing Co** → **MODERATE** (score 82): expired document + a few
  warnings (OEM validity, past-experience gap, GSTIN consistency).
- **PQR Technologies** → **CRITICAL** (score 15, forced): active debarment plus
  PAN/name mismatches, failed EMD/turnover/local-content, inactive GST.

See the walkthrough in [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md).

---

## Verifying the engine without a database

The compliance, discrepancy, and risk engines are pure functions and can be
verified offline — no database, no network, no API key:

```bash
npm run verify:engines
```

This runs the **real** engine modules against the demo dataset and asserts that
ABC = LOW, XYZ = MODERATE, and PQR = CRITICAL, printing each score and its
category breakdown. It exits non-zero if any bidder lands in the wrong band, so
it doubles as a regression test.

---

## AI extraction modes

`EXTRACTION_MODE` (in `.env`) selects the document extractor:

- **`seeded`** (default) — deterministic, offline parsing of the demo documents.
  No API key, no network. Demo-safe and reproducible.
- **`llm`** — routes the same documents to a real LLM over an OpenAI-compatible
  Chat Completions endpoint (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`). The
  model is constrained by a strict system prompt to **extract and describe
  facts only** — it never emits a compliance decision — and its output is
  validated with Zod before use.

Both adapters implement the same `DocumentExtractor` interface
([`src/server/ai/`](src/server/ai/)), so the rest of the pipeline is identical
regardless of mode.

---

## Security notes (MVP scope)

This is a hackathon MVP; it deliberately keeps the surface small, but applies
baseline hygiene:

- Secrets are read from environment variables; `.env` is git-ignored and only
  `.env.example` is committed.
- All government lookups and LLM calls happen **server-side** only.
- File uploads are validated for MIME type and size, and filenames are
  sanitized ([`/api/upload`](src/app/api/upload/route.ts)).
- API request bodies are validated with Zod.
- Errors are logged server-side; API responses return generic messages (no
  secret or stack-trace leakage).

**Not implemented (out of MVP scope):** authentication/authorization. The
"logged-in" officer identity is a configurable mock used only for audit
attribution. Add real auth before any production use.

---

## Honest limitations

- The nine government providers are **mocks** over seeded data. They are
  structured so a real authorized API can be dropped in behind the same
  interface, but **no real government integration exists in this repo.** The UI
  labels every source result as `MOCK`.
- There is no authentication.
- Document "OCR" is simulated by seeded document text; a real deployment would
  parse uploaded PDFs/images.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full design and extension points.
