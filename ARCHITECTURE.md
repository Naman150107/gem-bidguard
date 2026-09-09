# Architecture — GeM BidGuard

This document describes how GeM BidGuard is put together, the design principles
behind it, and where to plug in real integrations. For setup and usage, see
[`README.md`](README.md).

---

## Guiding principle: AI proposes, rules decide, a human approves

The single most important design decision is the strict separation of concerns
between the AI and the compliance logic:

```
Documents ──▶ [ AI extraction ]  ──▶ facts + findings
Gov records ─▶ [ mock providers ] ─▶ authoritative records
                     │
                     ▼
            [ discrepancy engine ]  (deterministic)
                     │
                     ▼
            [ compliance rules ]    (deterministic — decides PASS/FAIL/WARNING)
                     │
                     ▼
            [ risk engine ]         (deterministic — weighted score + bands)
                     │
                     ▼
            [ AI narration ]        (summary + recommendation, advisory)
                     │
                     ▼
        [ Procurement Officer ]     (records the final QUALIFY / REJECT)
```

- **The LLM only extracts and describes.** It reads documents and produces
  structured facts and plain-language findings. It is explicitly forbidden (by
  system prompt and by architecture) from deciding compliance.
- **All PASS / FAIL / WARNING outcomes are produced by deterministic code** in
  the compliance engine. Given the same inputs, the outcome is always identical
  and fully auditable.
- **The final decision is always a human's.** The officer's QUALIFY / REJECT is
  the only thing that sets the outcome, and it is recorded to an append-only
  audit trail.

This makes the system defensible for public procurement: every automated
conclusion can be traced to an explicit rule and its inputs, and no
consequential decision is delegated to a probabilistic model.

---

## High-level structure

```
src/
├─ app/                      Next.js App Router (server components + API routes)
│  ├─ dashboard/             Portfolio overview
│  ├─ tenders/               Tender list + detail
│  ├─ bidders/[id]/          Bidder detail + "Run verification"
│  ├─ verification/[id]/     Full report + officer decision
│  ├─ audit/                 Global filterable audit log
│  └─ api/                   verify · decision · upload  (server-only)
├─ components/
│  ├─ ui/                    Hand-rolled shadcn/ui-style primitives (no Radix)
│  └─ app/                   Domain components (badges, gauge, panels, trails)
├─ lib/
│  ├─ types.ts               Domain enums (const-objects) + disclaimer constant
│  ├─ config.ts              Weights, result contributions, risk bands (tunable)
│  ├─ queries.ts             All Prisma read queries (pages stay thin)
│  ├─ officer.ts             Mock logged-in officer (env-driven)
│  └─ utils.ts / labels.ts / doc-labels.ts   Formatting + humanizers
├─ data/
│  └─ demo.ts                Canonical demo dataset (single source of truth)
└─ server/                   Server-only business logic
   ├─ ai/                    DocumentExtractor interface + seeded & LLM adapters
   ├─ providers/             9 mock government source adapters + registry
   ├─ engine/                discrepancy · rules · risk (pure, deterministic)
   ├─ summary.ts             Deterministic narration (decision-support)
   ├─ audit.ts               Append-only audit writer
   └─ orchestrator.ts        The one pipeline entry point + officer decision
```

---

## The verification pipeline

`runVerification(bidderId, { officer, mode })` in
[`src/server/orchestrator.ts`](src/server/orchestrator.ts) is the single entry
point. It creates a `VerificationRun` (status `PENDING`), then runs six audited
steps and persists everything in one transaction:

1. **Extraction** — `getExtractor(mode).extract(documents)` returns an
   `ExtractedProfile` (identifiers, turnover, local-content %, EMD, OEM validity,
   plus low-confidence/EMD findings). Seeded or LLM adapter, same interface.
2. **Government sources** — `runAllProviders(query)` fans out to all nine mock
   providers concurrently; `indexResults` keys them by source.
3. **Discrepancy detection** — `detectDiscrepancies(input)` compares declared
   data, document contents, and government records (PAN/GSTIN/name/address,
   conflicting debarment declaration, inactive GST).
4. **Compliance rules** — `evaluateRules(input, discrepancies)` maps each rule
   code to a pure handler → PASS / FAIL / WARNING / PENDING. **The only place
   compliance is decided.**
5. **Risk scoring** — `computeRisk(ruleResults)` computes the weighted score,
   risk band, and per-category breakdown, applying the CRITICAL-fail gate.
6. **Narration** — `generateSummary(...)` produces the human-readable summary
   and recommendation from the engine output.

On success the run is marked `COMPLETED` with score, risk level, breakdown,
summary, and recommendation; on any error it is marked `FAILED`. Every step
appends an `AuditEvent` (batched write).

`recordDecision(runId, decision, { officer, note })` is separate and is the
**only** function that sets `QUALIFIED` / `REJECTED`.

---

## The engines (pure, deterministic, offline-verifiable)

The `src/server/engine/` modules are pure functions with no I/O, so they can be
unit-verified without a database or network. `npm run verify:engines` runs the
**real** modules against the demo dataset and asserts the three expected bands.

### Compliance rules ([`engine/rules.ts`](src/server/engine/rules.ts))

A `HANDLERS` map keyed by rule code (e.g. `RULE-EMD`, `RULE-TURNOVER`,
`RULE-OEM`, `RULE-GST`, `RULE-BLACKLIST`, `RULE-DOC-VALIDITY`,
`RULE-PAN-CONSISTENCY`, …). Each handler reads thresholds from the rule's
`config` via a `num(key, fallback)` helper, so limits are data-driven and
tunable per tender without code changes. Unknown rule codes fall back to
`PENDING` (manual review) rather than silently passing.

### Risk engine ([`engine/risk.ts`](src/server/engine/risk.ts))

Score = Σ over categories ( effectiveWeight · meanResultContribution ) · 100.

- Result contributions (PASS = 1.0, WARNING = 0.6, PENDING = 0.4,
  UNVERIFIED = 0.3, FAIL = 0.0, N/A = excluded) live in `config.ts`.
- A category with no applicable rules is dropped and its weight redistributed
  proportionally, so the score always spans 0–100.
- **CRITICAL-fail gate:** if any rule with `severityOnFail = CRITICAL` fails
  (e.g. active debarment), the risk band is forced to CRITICAL regardless of the
  numeric score. Toggle via `CRITICAL_FAIL_FORCES_CRITICAL` in `config.ts`.

### Discrepancy engine ([`engine/discrepancy.ts`](src/server/engine/discrepancy.ts))

Normalizes identifiers/names/addresses and cross-checks declared vs. document vs.
government values, including the PAN embedded in a GSTIN. Emits typed
`Discrepancy` records that feed the consistency rules.

---

## Government provider layer (mock, swappable)

Every registry is behind a common `GovProvider` interface
([`providers/types.ts`](src/server/providers/types.ts)):

```ts
interface GovProvider {
  source: GovSource;
  label: string;
  verify(query: ProviderQuery): Promise<ProviderResult>;
}
```

Nine adapters (GST, PAN, Udyam, MCA, EPFO, ESIC, Startup India, NSIC,
Debarment) are registered in
[`providers/registry.ts`](src/server/providers/registry.ts). The pipeline only
talks to the registry, so swapping a mock for a real API is a one-file change.

**These adapters are mocks.** Each delegates to `lookupMock`, which reads the
seeded `government` records from `src/data/demo.ts`, and every result carries
`isMock: true` (surfaced as a `MOCK` badge in the UI). Each adapter's header
documents exactly how to drop in the real authorized API: authenticate, query by
the relevant identifier, map the response into `ProviderResult.payload`, and set
`isMock: false`. **No real government integration exists in this repo, and the
app never claims otherwise.**

The debarment adapter documents an explicit interpretation contract: a
`VERIFIED` result with `payload.debarred === true` denotes an active debarment,
which the `RULE-BLACKLIST` handler treats as a CRITICAL failure.

---

## AI extraction layer (pluggable)

Two adapters implement the same `DocumentExtractor` interface
([`src/server/ai/`](src/server/ai/)):

- **Seeded** ([`seeded-extractor.ts`](src/server/ai/seeded-extractor.ts)) —
  deterministic parsing of labeled document text (`parse.ts` +
  `profile.ts`). No network, no key, confidence ≈ 0.98. Default and demo-safe.
- **LLM** ([`llm-extractor.ts`](src/server/ai/llm-extractor.ts)) — calls any
  OpenAI-compatible Chat Completions endpoint with a strict system prompt
  (extract/describe only, never decide), a 30-second timeout, and
  `response_format: json_object`. Output is validated with Zod
  ([`schema.ts`](src/server/ai/schema.ts)) and merged with deterministic
  findings.

`getExtractor(mode)` returns the LLM adapter only when `mode === "llm"` **and**
`LLM_API_KEY` is configured; otherwise it safely falls back to seeded. This
means the demo never breaks due to a missing key or offline environment.

---

## Data model (Prisma / PostgreSQL)

Key entities ([`prisma/schema.prisma`](prisma/schema.prisma)):

- `Tender` → `TenderRequirement` (eligibility) and `Rule` (deterministic checks)
- `Bidder` → `Document`
- `VerificationRun` → `RuleResult`, `Finding`, `Discrepancy`, `ProviderResult`,
  `AuditEvent`, and one `OfficerDecision`

**Enums as strings.** Status/result fields are modelled as `String` in the
schema, with the allowed values defined once as `const`-object unions in
[`src/lib/types.ts`](src/lib/types.ts) and enforced by Zod. This keeps the
domain vocabulary in a single place, serializes cleanly to JSON, and — crucially
— lets the engine modules run under Node's type-stripping loader for the offline
verification harness.

---

## Import & runtime conventions

- **`src/server/**` is server-only.** The orchestrator imports `server-only`;
  provider and LLM calls never run in the browser.
- **Import style:** modules under `src/lib`, `src/data`, and `src/server` use
  **relative** imports so they are portable to the `tsx`/Node offline runners;
  the `@/` alias is used only in `src/app` and `src/components`.
- **Offline engine harness:** `scripts/tshook.mjs` registers a resolver
  (`scripts/resolver.mjs`) that maps extensionless relative imports to their
  `.ts` files, letting `node --experimental-strip-types` execute the real engine
  source in-sandbox — no build step, no database.

---

## Security posture (MVP)

- Secrets via environment variables only; `.env` git-ignored,
  `.env.example` committed.
- All external calls (gov lookups, LLM) are server-side.
- Uploads validated for MIME type and size; filenames sanitized; text stored
  inline up to a cap, binaries as placeholders
  ([`api/upload/route.ts`](src/app/api/upload/route.ts)).
- All API bodies validated with Zod; errors logged server-side, generic
  messages returned to clients.
- **No authentication** — explicitly out of scope. The officer identity is a
  configurable mock for audit attribution only. Add real auth before production.

---

## Extension points (path to production)

1. **Real government APIs** — replace each mock adapter's `lookupMock` call with
   an authenticated API call; set `isMock: false`. No pipeline changes needed.
2. **Real document ingestion** — add OCR/PDF parsing ahead of the extractor;
   the `DocumentExtractor` interface stays the same.
3. **Authentication & RBAC** — add auth (e.g. NextAuth) and replace
   `getCurrentOfficer()`; wire officer identity into every audit write.
4. **Rule authoring UI** — rules are already data-driven (`config` JSON per
   rule); a UI could let officers tune thresholds per tender.
5. **LLM hardening** — add retries, response caching, and prompt/version
   logging around the LLM adapter for production traceability.
