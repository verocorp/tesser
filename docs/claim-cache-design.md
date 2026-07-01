# Claim-cache design (stage A — defined 2026-06-18, /plan-eng-review + Codex outside voice)

**What this is:** the design for tesser's answer reuse — the long-deferred B-ii.
It **supersedes** the parked "answer cache" framing and extends
`grounding-design.md` (the two-actor model). The cache is the third thing the two
actors share, alongside the clone and the build.

**The reframe (why "define an answer" dissolves):** the answer cache was blocked
on defining "an answer," because keying on the *question* is fuzzy and
paraphrasable. The move is to stop caching answers and cache **claims at a
coordinate**. A clone, a build result, and a saved FAQ fact are the *same kind of
thing*: claims at one coordinate `(identity, sha)`, differing only by grade
(`recall < docs < inspect < run`) and distillation. So there is **one cache**,
keyed by coordinate, holding graded claims. A question is a **query into it, never
a key**. Grounded in the locked kernel `everything-is-a-claim`.

**Scope (locked, D1):** **A — full reuse loop, boring retrieval.** Reuse the
existing whole-repo digest as the claim store; retrieval = the agent reads the
local digest and judges sufficiency. **Minimal schema touches** are in scope (a
docs-grade digest variant + a recall-provenance citation form — both forced by the
design, see D8); a **granular structured claim store and any retrieval engine are
deferred** behind eval evidence (NOT in scope). Honest correction from the Codex
pass: the "deterministic core" is the consult *plumbing* (lookup, fetch, strip);
claim *selection* is latent and eval-gated. Do not oversell it as deterministic.

---

## The model — two tiers plus background

```
QUESTION about repo R
  |
  v
RESOLVE IDENTITY (foreground)
   recall / paste -> URL -> normalized identity
   bare name -> NAME->IDENTITY INDEX (D7) -> identity   (else search)
  |
  v
TIER 1 — MEMORY (foreground, ONE beat-1 response)
   consult: look up digest(s) for the identity, read the best one if present
   fuse cached claims + training, RELEVANCE-and-grade-aware:
     a cached claim outranks raw recall ONLY when it is relevant, in-scope, and
     answers THIS question (a stale / over-broad / question-mismatched cached claim
     does NOT auto-dominate — guard required).
   a cache MISS is a small local lookup (~ms), folded into the same response.
        |
        | memory (cache ∪ training) insufficient AND a URL is known
        v
TIER 2 — ONE LICENSED SOURCE-TOUCH (foreground)
   scripts/fetch docs <url>  (README + docs/, treeless+sparse, docs-grade).
        |
        v
BACKGROUND (the only actor that touches source beyond the one docs fetch)
   open citations, full clone, build, run, mint + persist claims, drift, supersede.
```

**The grade ladder IS the foreground/background boundary.** `recall + docs` =
foreground; `inspect + run` = background.
- Foreground **produces** up to docs-grade live (training + the one docs fetch).
- Foreground **serves** cached claims of *any* grade, **citation-stripped** (see
  the provenance distinction below).
- Touching source past the one docs fetch (open a citation, clone, build, run)
  makes you the background actor by definition. The citation-opening invariant
  falls out for free.

**Provenance, four surfaces (Codex #4).** "Served with provenance" and
"citation-stripped foreground" are both true once the surfaces are separated:
- **digest provenance** — the full `⟦path:Lstart-Lend⟧@sha` (or recall marker) in
  the stored claim.
- **model-visible provenance** — the grade tag the foreground reads (`docs`,
  `inspect`, `run`, `recall`), NOT the raw `⟦⟧@sha` markup.
- **developer-visible provenance** — plain English ("read it at the README",
  "recalling from training, unverified"); raw markup never reaches the dev (already
  the output-contract rule).
- **log provenance** — `consulted_cached_digest` + `digest_sha256` in the log.

---

## Locked decisions

- **A1 (D2) — foreground licensed consult.** Both actors read the cache. Beat-1 =
  one memory response fusing cache ∪ training. Reading the local digest is a
  licensed foreground read (same principle as the readme-first docs fetch).
- **Citation / grade invariant.** Foreground produces ≤ docs-grade live and never
  opens a citation; inspect and run are background-only. **Enforced in the binary:**
  the consult helper serves the foreground a citation-stripped (claim + grade) view;
  the background gets the full cited digest.
- **D3 — reverse D47.** The background persists overview groundings (docs-grade), so
  the store seeds for the common case. Founding-case basis; overview's share of real
  traffic is **to be measured, not assumed**.
- **D4 — serve unchecked.** No serve-time digest integrity in v1 (filesystem trust,
  D35) for the trusted-dev alpha. Tampering is not the threat to solve now.
- **D7 — build the name→identity index now.** A minimal alias map
  (package/import name + recalled/pasted URL → normalized identity) so a bare-name
  re-ask resolves to the cached identity without re-searching. Makes the founding
  case ("unknown dep asked twice is instant") work for any re-ask shape, and doubles
  as the **stored canonical URL** the background needs for drift (closes Codex #7)
  and the lookup over **multiple digests per identity** (closes Codex #10).
- **D8 — minimal schema touches for overview-persist.** (a) Allow `commands` empty
  when `truth_grade: docs` (an overview ran none); citations still required but may
  point at README/docs lines. (b) Add a **recall/training provenance citation form**
  inside the reserved `⟦⟧` bracket (e.g. `⟦recall⟧`) so a fused/persisted claim from
  training is tagged honestly and never laundered as source-grounded. Both reuse the
  reserved delimiter to preserve token-totality (learning:
  `reserved-delimiter-validation-totality`). This overturns the v1 "no schema change"
  line — Codex was right that overview-persist is not free.

---

## Enforcement / test plan

Deterministic plumbing (index, consult, strip, persist, validate) is unit/
integration tested. Claim *selection* and *sufficiency* are **eval-gated**
(measured, not asserted). Every spec edit lands WITH its gate
(`spec-without-pins-diverges`).

| Behavior | Surface | Test |
|---|---|---|
| name→identity index: lookup, multiple-digests-per-identity, stored URL | deterministic | UNIT |
| consult: hit → stripped foreground view + grade | deterministic | UNIT (strip correctness) |
| consult: foreground view never contains `⟦⟧@sha` | binary (push-down) | UNIT (guarantee, not prose) |
| consult: background view = full cited digest | deterministic | UNIT |
| schema: docs-grade commands-optional + recall citation form | digest-schema.yaml | UNIT (validator) + spec-as-data gate |
| overview-persist (reverses D47) | subagent-brief §6 | INTEGRATION + **REGRESSION (critical)** |
| two-tier memory beat-1 + grade boundary wording | SKILL.md | STRUCTURAL gate |
| reconcile the `digest-consult` clause to the truth | contract.yaml | STRUCTURAL gate-1 |
| write-concurrency: atomic stage→rename, first-writer | subagent-brief §6 / validate-digest | UNIT (Codex #11) |
| **sufficiency decision (serve vs ground)** — the primary eval unit | behavioral | **EVAL** (Codex #8) |
| retrieval: select the right claim, do not over-serve stale/adjacent | behavioral | EVAL (precision/recall@k + the guard) |
| grade-honesty: foreground never claims inspect/run grade live | behavioral | EVAL (judge principle) |
| cache-hit: instant, zero foreground source-touch | behavioral | SCORER + judge p9 |

**The eval's primary unit is the serve-vs-ground decision, not claim-selection
precision (Codex #8).** Over-serving a stale or adjacent cached fact instead of
going to source is the dangerous failure; precision/recall@k alone misses it.

**Adversarial eval fixtures (adopt, Codex #9):** same package name across
ecosystems; monorepo subpackages; renamed repos; old-SHA digest vs current docs;
a digest with a true-but-irrelevant claim; a digest with mixed run/docs claims;
private/unreachable on drift. Plus the teaching-to-the-test fixture linter
(gbrain `routing-eval`).

**REGRESSION (iron rule):** reversing D47 flips the existing "overview persists
nothing" assertion. The old gate updates to the new behavior; a test confirms an
overview run persists a docs-grade digest.

---

## Implementation tasks (build order)

- [ ] **T1 — name→identity index (D7).** Alias map (name + canonical URL →
  normalized identity); lookup on consult; stores the canonical URL for drift.
  Files: `scripts/fetch` (or a helper), an index format under `~/.tesser/`.
- [ ] **T2 — consult helper (deterministic).** Given identity: find the best
  digest, return the foreground stripped view (claim + grade) / background full
  view. Files: `scripts/fetch consult`, `tests/fetch.test.ts`.
- [ ] **T3 — schema touches (D8).** docs-grade `commands` optional; recall citation
  form in the reserved bracket. Files: `digest-schema.yaml`,
  `scripts/validate-digest`, `tests/validator.test.ts`.
- [ ] **T4 — overview-persist (reverse D47, REGRESSION).** Background persists
  overview groundings as docs-grade digests; reconcile `contract:readme-first`.
  Files: `subagent-brief.md §6`, `contract.yaml`, structure gate.
- [ ] **T5 — SKILL.md two-tier beat-1 + grade boundary; reconcile `digest-consult`
  clause.** Files: `SKILL.md`, `contract.yaml`, `tests/structure.test.ts`.
- [ ] **T6 — retrieval-eval harness.** Sufficiency-decision metric + the adversarial
  fixtures. Files: `tests/scoreboard/` (new eval), fixtures.
- [ ] **T7 — write-concurrency.** Atomic stage→rename / first-writer on persist.
  Files: `subagent-brief.md §6` / `scripts/validate-digest` move step.

---

## Credentialed provider runs + the evidence layer (2026-06-25 retro input)

Three credentialed `/tesser` sessions (65554f54 AWS Lambda microVMs, b3455559
ClickHouse Cloud, 2c7423b5 AssemblyAI medical-STT bake-off) produced the retro
that ratified D49–D53 (the provider-grounded carve-out) and then surfaced wrinkles
the carve-out does not yet handle. The carve-out makes *single-service* credentialed
runs persistable; the dominant real shape is **comparative, measurement-bearing, and
conditionally-reproducible**. These land here because they are the cache re-work's
design, not a v1 patch.

**The through-line (the design spine).** The digest holds **captured evidence +
provenance pointers**; everything derived from it — comparisons, reproducibility,
grade nuance, the prose answer — is **computed just-in-time, not redundantly written
in.** Chris reached this from three directions (JIT comparison, "capture the evidence
not a second written record", "a boolean is a judgment on top of raw evidence"); it is
one principle.

**The evidence-bundle model (W3 + W8).** Today the run grade *re-transcribes*
observed outcomes into prose and backs them with *source* citations to the code
(conc's "counter exactly 100 ⟦pool/pool.go:L1-L60⟧" — the citation points at the code
that *should* produce the behavior; the observed value points at nothing). There is no
pointer-able evidence artifact for an observation. `⟦observed⟧` (D51) is the right slot
but bare; filling it with data+caveats would make it a re-transcription — the overclaim
D51 exists to prevent. Fix: a persisted digest becomes a small **directory**
(`digest.md` + an `evidence/` dir of captured-as-produced artifacts — raw API
responses, results TSVs, the generated `wer-report.html`), and `⟦observed⟧` gains a
**pointer form** (`⟦evidence/wer-results.tsv:L4-L9⟧`) structurally parallel to
`⟦path:L-L⟧@sha`, with quote-in-range verifying against the bundled evidence file.
This solves W8 (the artifact *is* the bundle, not a fragile external reference) and
retroactively upgrades *existing* run-grade digests — a general run-grade improvement,
not provider-only. Rejected: point-at-project-artifact (fragile; collapses into the
bundle) and a separate hand-authored measurement file (a second written record — the
thing to avoid).

**Derived-not-stored, three instances.**
- **W1 — comparison has no identity.** A bake-off (AssemblyAI vs Deepgram vs Cartesia
  on one corpus) is the load-bearing artifact but has no single `provider/...`
  identity. Do not mint a bespoke "comparison" identity; store each service's raw
  captured evidence and **derive the matrix on read (JIT)** (Chris's call, 2026-06-25).
- **W4 — `reproducible` boolean is a smell.** It is a *judgment on top of evidence*,
  and not even single-valued (WER reproduces, latency does not). Its only real job is a
  bundling/shareability gate on an empty, manually-committed shared set; leave the
  boolean as a v1 stopgap and, in the re-work, **derive shareability from the
  provenance** rather than store a bit.
- **W9 — provenance must capture the measurement apparatus.** An observation's
  environment includes the observer, not just the system-under-test: the AssemblyAI
  latency is "as measured by a laptop on residential net → GCP" — two environments in
  one fact. Capture the full apparatus; staleness/comparability become derivable
  (nothing is fully reproducible — you are labeling thresholds).

**Personal-vs-shareable is a cache-identity axis.** Credentialed/account-specific
digests (ClickHouse billing, AssemblyAI results), private-repo digests, and anything
with PII/secrets in captured evidence must never enter the bundled `digests/` set
(whose only share path is a repo commit + clone, currently empty). The re-work models
personal vs shareable properly; v1's `scope: personal` + `reproducible: false` are the
stopgap.

**Known v1 limit (acted on now).** Until the evidence-bundle exists, a
measurement-bearing run cannot be finalized without either losing the numbers (bare
`⟦observed⟧`) or overclaiming (data-in-marker). So **do not `/tesser-finalize`
measurement-bearing runs** for now; the silent-drop guard ("this run isn't persisted")
already covers saying so.

**Dispositions of the other wrinkles.** W2 (hybrid SDK+service) is **closed** — make
two digests, the SDK repo-anchored and the service provider-anchored; the schema
already supports it. W5/W6/W7 (credential handling: reference-not-read,
narrowest-revocable-identity, teardown-where-broad, no machinery, + the harness-cred
role) are a **contract change** to the `always-verify` D49 opt-in, not a cache-layer
concern. This whole section feeds the **cache red-team** (TODOS) — the
memory-architecture decision the current `identity@sha` flat-file scheme is only a
baseline for.

---

## NOT in scope (deferred, with rationale)

- **Granular structured claim store + retrieval engine** — eval-gated. Build only
  if the retrieval/sufficiency evals show the agent cannot select within a coarse
  whole-repo digest. Codex (#2, #12) argues a sidecar index may be *simpler* than
  rereading markdown; we hold the deferral but treat the evals as the decider, not
  taste. (Note: D7's name→identity index is NOT this — it is an *identity* index,
  not a *claim* index.)
- **Serve-time digest integrity** (D4=B) — revisit past the trusted-dev alpha. See
  TODOS.
- **Cache expiry / claim-validity** — the bigger problem (claim-level staleness,
  append-only growth, eviction, cross-commit validity, "confidently old by design"
  per Codex #6). v1's only expiry is async-drift (serve → background drift-check on
  the sha → supersede). See TODOS.

## What already exists (reused, not rebuilt)

- **Coordinate keying** — `digest-schema.yaml` identity + sha; `scripts/fetch`
  normalizes and pins. The digest frontmatter already stores the `repo` URL (feeds
  D7's drift-URL need).
- **The claim store + validation** — the digest + `scripts/validate-digest`.
- **Substrate + evidence** — `~/.tesser/clones/`, `~/.tesser/builds/` (the
  builds/ stage→validate→move flow is the seed of T7's atomic persist).
- **Persist (build-depth)** — `subagent-brief.md §6`; stage A extends it to docs
  grade.
- **Async-drift** — v1's expiry baseline.
- **Eval prior art** — gbrain `eval.test.ts`, `routing-eval.test.ts` (+ fixture
  linter), `takes-quality-eval/rubric.ts`; tesser's `score.ts` + `judge-rubric.ts`.

## Headline

Most machinery exists. Stage A is the read/serve half plus the eval harness, with
two minimal schema touches Codex forced (docs-grade digest, recall citation) and a
small identity index that makes the founding case real. The deferred line to hold:
no granular claim store / retrieval engine until the sufficiency evals demand it.
