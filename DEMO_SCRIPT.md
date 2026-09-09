# Demo Script — GeM BidGuard

A ~6-minute walkthrough for judges. It tells one story: **three bidders on the
same tender, three very different risk outcomes, all produced by transparent
rules with a human making the final call.**

The tender is a real-world-style GeM procurement:
**Supply, Installation & Commissioning of Industrial-Grade Centrifugal Pumps**
for the Ministry of Petroleum & Natural Gas (est. ₹4.5 Cr, ref
`GEM/2026/B/PNG/4471123`).

---

## 0. Setup (before the demo)

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL / DIRECT_URL
npm run db:reset              # schema + seed (tender, rules, 3 bidders, docs)
npm run demo:verify           # generate a verification run for each bidder
npm run dev                   # http://localhost:3000
```

Optional confidence check that the engine outcomes are real, not hard-coded:

```bash
npm run verify:engines
# → ABC = LOW (100) · XYZ = MODERATE (82) · PQR = CRITICAL (15, forced)
```

Have the app open at `/dashboard`.

---

## 1. Framing (30s)

> "GeM procurement officers manually cross-check every bidder's documents
> against multiple government portals — GST, PAN, MSME, EPFO, debarment lists.
> It's slow and error-prone. GeM BidGuard automates the *checking* and *risk
> scoring*, but keeps the officer in charge of the *decision*."

Point to the disclaimer banner:

> "This is the core principle — the AI extracts and explains, deterministic
> rules score, and a human officer decides. The AI never disqualifies anyone."

---

## 2. Dashboard (45s)

On `/dashboard`, point out:

- **Stat cards** — bidders under evaluation, how many verified, qualified,
  rejected.
- **Risk distribution chart** — three bidders spread across LOW / MODERATE /
  CRITICAL.
- **Recent activity** — the live audit trail feed.
- **Bidders table** — the three scores side by side.

> "One tender, three bidders, three risk bands. Let's see why."

---

## 3. Tender context (45s)

Click into **Tenders → the pumps tender**. Show the tabs:

- **Requirements** — eligibility conditions (EMD, turnover, OEM authorization,
  local content, statutory registrations).
- **Compliance rules** — the deterministic checks, each with a weight category
  (Mandatory 50% / Statutory 25% / Document 15% / Consistency 10%) and a failure
  severity.

> "These rules are data-driven — thresholds live in config, so an officer could
> tune them per tender without touching code. Nothing here is decided by the AI."

---

## 4. The clean bidder — ABC Engineering (45s)

Open **ABC Engineering Pvt Ltd → View full report**.

- Score **100 / LOW**, every category green.
- Government source checks all **VERIFIED** (note the **MOCK** badges — be
  honest that these read seeded data, not live portals).
- No discrepancies, no failed checks.
- Recommendation: *recommended for qualification, subject to officer
  confirmation.*

> "This is the happy path. The officer can qualify with confidence — but it's
> still their click, recorded in the audit trail."

Scroll to **Officer decision**, click **Qualify bidder**, add a note. Show the
decision badge flip and the new audit entry appear.

---

## 5. The borderline bidder — XYZ Manufacturing (60s)

Open **XYZ Manufacturing Ltd → View full report**.

- Score **82 / MODERATE**.
- **One FAIL:** `RULE-DOC-VALIDITY` — an expired EPFO document.
- **Warnings:** OEM authorization expiring soon, past-experience just under the
  preferred count, EPFO contribution arrears, a GSTIN-consistency note.
- The score breakdown shows Document validity dragged down to 50% while the
  other categories stay strong.

> "This is where the tool earns its keep. It's not a clear pass or fail — the
> officer sees exactly which document expired and which warnings to weigh, then
> decides whether to seek clarifications or qualify."

---

## 6. The disqualifier — PQR Technologies (75s)

Open **PQR Technologies Pvt Ltd → View full report**.

- Score **15 / CRITICAL**, with the red **"Risk elevated to CRITICAL by a hard
  disqualifier"** banner.
- **Active debarment** on record (`RULE-BLACKLIST` fails at CRITICAL severity) —
  this alone forces CRITICAL regardless of score.
- **Cross-source discrepancies:** the bidder declares PAN `AAFPQ9999K`, but the
  PAN embedded in their own GSTIN (`07AAFPQ1111K1Z3`) and the government record
  say `AAFPQ1111K` — a **PAN mismatch**. The legal name also differs from the
  MCA record ("PQR Technologies" vs "PQR Tech Solutions").
- Plus: GST suspended, unpaid EMD, sub-threshold turnover and local content,
  missing labour documents, and a **false "not debarred" declaration**.

> "Notice the bidder *declared* they weren't debarred — but the debarment
> registry says otherwise. That conflict is caught deterministically and logged.
> Even with all this, the system doesn't auto-reject: it hands the officer a
> fully-evidenced CRITICAL and lets them record the rejection."

Scroll to **Officer decision**, click **Reject bidder**, add a note.

---

## 7. Audit trail (30s)

Go to **/audit**.

- Every extraction, source check, discrepancy, rule evaluation, risk score, and
  officer decision is here — append-only, timestamped, attributed.
- Use the search/filter to isolate, e.g., all **Officer decision** events or a
  single bidder.

> "For public procurement this is essential: any conclusion can be traced back
> to the exact rule and inputs that produced it, and every human decision is on
> record."

---

## 8. Close (30s)

> "To recap: the AI reads documents and explains findings, deterministic rules
> produce every compliance outcome, a weighted engine scores risk, and the
> officer makes the final call — all auditable end to end. The nine government
> integrations are mocked today behind a clean interface, so authorized APIs
> drop in without touching the pipeline. And the whole engine is verifiable
> offline with a single command."

Optionally run `npm run verify:engines` live to prove the outcomes are computed,
not scripted.

---

## Talking points / likely questions

- **"Is the AI making the decision?"** No. The LLM only extracts facts and
  writes the summary. All PASS/FAIL/WARNING outcomes come from deterministic
  code, and qualification is always the officer's recorded action.
- **"Are these real government integrations?"** No — they are mock providers
  reading seeded data, clearly labelled `MOCK` in the UI. Each is a drop-in
  point for a real authorized API behind the same interface.
- **"Can the scoring be changed?"** Yes — weights, per-result contributions, and
  risk bands are all in `src/lib/config.ts`; per-rule thresholds are in each
  rule's `config`.
- **"What if the LLM is unavailable?"** The default seeded extractor runs fully
  offline; the app falls back to it automatically when no LLM key is set.
- **"How do you know the outcomes aren't hard-coded?"** `npm run verify:engines`
  runs the real engine modules against the demo data and asserts the bands.
