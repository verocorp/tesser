# Claim-cache design (stage A — defined 2026-06-18, /plan-eng-review)

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
a key**. We never cache answers; we cache claims and answer questions from them.
Grounded in the locked kernel `everything-is-a-claim` /
`knowledge-is-bottom-of-claim-ladder`.

**Scope (locked, D1):** **A — full reuse loop, boring retrieval.** consult +
serve-with-provenance + overview-persist + async-drift-on-serve + the
retrieval-eval harness. Reuse the existing whole-repo digest format **unchanged**;
retrieval = the agent reads the local digest and judges sufficiency. No new
datastore, no schema change, no retrieval engine. The granular claim store and any
retrieval engine are deferred behind eval evidence (see NOT in scope).

---

## The model — two tiers plus background

```
QUESTION about repo R
  |
  v
TIER 1 — MEMORY (foreground, ONE beat-1 response)
   read the local digest if it exists  +  use training, fuse grade-aware
   (a cached claim was grounded once, so it outranks raw recall and calibrates it).
   a cache MISS is one local file check (~ms), folded into the same response.
   NOT a separate step, NOT a round trip.
        |
        | memory (cache ∪ training) insufficient AND a URL is known/recalled
        v
TIER 2 — ONE LICENSED SOURCE-TOUCH (foreground)
   scripts/fetch docs <url>  (README + docs/, treeless+sparse, docs-grade).
   answer from it. still beat-1.
        |
        v
BACKGROUND (the only actor that touches source beyond the one docs fetch)
   open citations, full clone, build, run, mint + persist claims, drift, supersede.
```

**The grade ladder IS the foreground/background boundary.** `recall + docs` =
foreground; `inspect + run` = background.
- Foreground **produces** up to docs-grade live (training + the one docs fetch).
- Foreground **serves** cached claims of *any* grade (a run-grade fact a prior
  build minted is in memory now, served citation-stripped).
- Touching source past the one docs fetch (open a citation = read a source file =
  inspect, clone the full tree, build, run) makes you the background actor by
  definition. The citation-opening invariant falls out of this for free.

---

## Locked decisions (plan-eng-review 2026-06-18)

- **A1 (D2) — foreground licensed consult.** Both actors read the cache. Beat-1 =
  one memory response fusing cache ∪ training. Reading the local digest is a
  licensed foreground read on the same principle as the readme-first docs fetch
  (the read that IS the answer's source).
- **Citation / grade invariant.** Foreground produces ≤ docs-grade live and never
  opens a citation; inspect and run are background-only. Enforced in the binary:
  the consult helper serves the foreground a **citation-stripped** view (you
  cannot open what you never receive); the background gets the full cited digest.
- **D3 — reverse D47.** The background persists overview groundings (today the
  ground/overview depth persists nothing), so the store seeds for the common case.
  Justified by the founding case (unknown dep asked twice); the share of traffic
  that is overview is **to be measured, not assumed** (the corpus 40% figure is
  observed-so-far, not world-true).
- **D4 — serve unchecked.** No serve-time digest integrity in v1. Filesystem trust
  (D35) holds for the trusted-dev alpha; tampering is not the threat to solve now.

---

## Enforcement / test plan

The deterministic core is fully unit/integration testable; retrieval quality is
**eval-gated** (measured, not asserted — the project's premise). Every spec edit
lands WITH its gate (learning: `spec-without-pins-diverges`).

| Behavior | Surface | Test |
|---|---|---|
| consult: hit → stripped foreground view + grade | deterministic helper | UNIT: strip correctness, grade passthrough |
| consult: foreground view never contains `⟦⟧@sha` | binary (push-down) | UNIT: invariant is a guarantee, not prose |
| consult: miss / malformed digest | deterministic helper | UNIT: graceful miss |
| consult: background view = full cited digest | deterministic helper | UNIT: citations present |
| overview-persist (reverses D47) | subagent-brief §6 | INTEGRATION + **REGRESSION (critical)** |
| two-tier memory beat-1 wording | SKILL.md | STRUCTURAL gate |
| reconcile the `digest-consult` clause | contract.yaml | STRUCTURAL gate-1 (lands with the truth) |
| retrieval quality (right claims + real answer) | behavioral | EVAL: precision/recall@k (gbrain `eval.test.ts`) + false-pos/neg selection (`routing-eval`) |
| grade-honesty (no live inspect/run claim) | behavioral | EVAL: judge principle |
| cache-hit: instant, zero foreground source-touch | behavioral | SCORER (TTFA, foreground source-touch = 0) + judge p9 |

**REGRESSION (iron rule):** reversing D47 flips the existing "overview persists
nothing" assertion. The old gate updates to the new behavior, and a test confirms
an overview run persists a digest.

---

## NOT in scope (deferred, with rationale)

- **Granular claim store + retrieval engine** — eval-gated. Build only if the
  retrieval evals show the agent cannot select within a coarse whole-repo digest.
  Premature now (would spend an innovation token + change the schema before
  evidence).
- **Digest schema / finer claim entries** — same trigger as above.
- **Serve-time digest integrity** (D4=B) — revisit when the audience widens past
  trusted devs. See TODOS.
- **Cache expiry / claim-validity** — the bigger problem flagged by the maintainer:
  claim-level staleness, append-only growth interaction, eviction/retention,
  cross-commit validity. v1's only expiry mechanism is the existing async-drift
  (serve → background drift-check on the sha → supersede). See TODOS.

## What already exists (reused, not rebuilt)

- **Coordinate keying** — `digest-schema.yaml` identity (host + org-path + repo) +
  sha; `scripts/fetch` normalizes identity and pins.
- **The claim store + validation** — the digest IS a coordinate-keyed cited-claim
  set; `scripts/validate-digest` enforces it.
- **Substrate + evidence layers** — `~/.tesser/clones/`, `~/.tesser/builds/`.
- **Persist (build-depth)** — `subagent-brief.md §6`; stage A extends it to the
  overview depth.
- **Async-drift** — the existing serve-now / background-drift / supersede path is
  v1's expiry baseline.
- **Eval prior art** — gbrain `eval.test.ts` (precision/recall/mrr/ndcg),
  `routing-eval.test.ts` (false-pos/neg + the teaching-to-the-test fixture linter),
  `takes-quality-eval/rubric.ts`; tesser's own `score.ts` + `judge-rubric.ts`.

## Headline

Most of the machinery already exists. This stage is the **read/serve half plus the
eval harness**, not a greenfield build. The one quiet over-build risk is a
retrieval engine where one agent reading one local markdown file is correct. Hold
that line.
