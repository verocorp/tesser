# Grounding-flow dimensions

**What this is:** the MECE set of *state variables* that determine tesser's grounding
flow paths — the inputs to the resolver, not the resolver. It is **not** the flow
itself (which variable is read at which decision, the transitions, the terminals —
that's the state machine in `grounding-fsm.html`), **not** a spec-as-data file, and
**not** code. It's the distillation the flow will be a policy over.

**Why it exists / the method:** hand-iterating the FSM diagram forced a whole-graph
re-reason on every change (the parked `65939f64` failure). Distilling the orthogonal
state variables first makes a change *local* — it touches one variable, not the whole
graph — and the cross-cutting invariants explicit and checkable instead of re-derived.

**How it was derived (and twice corrected):**
1. A first cut partitioned variables by **stability** (static facts vs derived loops).
   Three independent red-teams (the author + two fresh-context adversarial agents) tore
   it down: stability is a property the *flow* creates, not something intrinsic to a
   variable — three "static" dims provably mutate mid-run.
2. A second cut partitioned by **retention** (one-time findings vs carried cursors vs
   persisted state). Same bug, subtler: "will I need this later?" is also flow-assigned
   and *not knowable up front* — when `ls-remote` returns 404, whether that's
   forget-now or keep-it depends on a later step you haven't reached. Stamping retention
   onto the variable is the same error as stamping stability.

So the only cut that is **intrinsic and knowable up front** is *where the value comes
from*:

> **Given** — it came from the dev/the world · **Derived** — you produced it by doing
> something · **Events** — a momentary arrival

**Retention is a separate axis laid over the derived values — not a category.**
forget-now / keep-this-run / keep-across-runs. The flow assigns it, late, and can
revise it. Practical rule, since it's unpredictable up front: **carry everything within
a run** (cheap, and you can't know what you'll need). The *only* retention decision with
consequences is **persist-to-`~/.tesser/` or not** — made deliberately at the terminals,
because it's the channel that couples one invocation to the next.

---

## Given (from the dev/world this turn; can change next turn)

| Variable | Values | Notes |
|---|---|---|
| **Altitude / JTBD** | overview → does-it-work → make-it-work → build-verify | Per-turn, **escalates** (`d5eec575` overview→build). Sets target rung + ceiling. Carries the dev's specific *obligations* (see obligation-coverage, below). |
| **Reference, as supplied** | the raw token/URL + did the dev give a URL? | The *subject* provenance (dev-named vs not) — distinct from the working URL provenance, which is derived. |
| **Subject cardinality** | one ref / N refs | N>1 imposes a **join + partial-result** requirement on the output (one leg can be private) — not a clean "loop per ref." |

## Derived (you produced it by doing something — one bucket; retention is a separate note)

The finding-vs-cursor split is gone — these are all just values you compute by acting.
The **Retention** column is the orthogonal axis, assigned by the flow: *within-run* =
carry it, don't think about it; *across-runs* = a deliberate persist decision at a
terminal, and the cross-invocation coupling channel.

| Variable | Values | Retention | Notes |
|---|---|---|---|
| **Model-knows-the-dep?** | recognizes / doesn't | within-run | Drives beat-1 source (knowledge answer vs foreground grounding) — the 25s-vs-163s difference (`SKILL.md:46-47`, `b40f75e1`). |
| **`dependency_kind`** | clonable-cli / clonable-library / sdk-of-hosted-service / hosted-closed / heavy-infra | within-run | Preflight classification (`digest-schema.yaml:64`). The verification **ceiling**; governs whether the uniform-clone shape applies (clonable) or a docs-only branch does (non-clonable). |
| **Identity-resolution outcome** | unresolved / resolved+pinned / **404-ambiguous (gone-or-private)** | within-run | The `ls-remote` result. "Reachability" is **not** a separate axis — inaccessible *is* the 404 value, refined only by the S8 retry. |
| **Reachability refinement** | public-ok / ambient-creds-ok / inaccessible | within-run | A *sub-outcome* of the same act + S8 ambient-creds retry; only meaningful after a 404. |
| **Working reference + URL-provenance** | dev-given / recalled / search-derived | within-run | **Flips** when a recalled URL 404s → search picks a new one (`grounding-fsm.html:76`). Re-read by later decisions — which is exactly why pre-sorting "finding vs cursor" was pointless. |
| **Subject-identity confidence** | sure / unsure | within-run | Re-judged at interpret → search-candidates → README. **Co-evaluated with sufficiency** at the README read — a mismatch is *also* insufficient; not orthogonal, stated honestly. |
| **Sufficiency** | enough / climb one rung | within-run | Re-judged per rung. This judgment and the rung-path output are **one feedback loop**. |
| **Ladder cursor** | current materialization/rung | within-run | Where you are on the one progressively-materialized clone (sparse README → wider → full tree → built). |
| **Action outcome + proxy-trust** | success / nonzero-exit / timeout / errored — **and is the success signal trustworthy?** | within-run | The D48 axis: exit 0 / HTTP 200 / enqueued-id ≠ did-the-thing. |
| **Observability** | agent-observable / dev-must-observe | within-run | For does-it-work/make-it-work: can tesser watch the ground-truth signal itself, or must it instruct the dev? Independent of altitude. Determines whether the answer ships the full delegation verification-contract. |
| **Local supply** | clone (+ materialization level) / map / build present | **across-runs** | A *prior* run's persist decision, read at this run's start. Floors the reuse short-circuit. `map ⟹ clone` (invariant 5). |
| **Prior `truth_grade`** | docs / inspect / run | **across-runs** | A stored map's grade short-circuits *this* run's build path (`subagent-brief.md:64`). Last run's output → this run's input. |
| **Drift state** | reused-unchecked / confirmed-current / drift-found | **across-runs** | Set on a warm serve, resolved async. |

## Events (momentary arrivals — not standing state)

| Event | Branches | Notes |
|---|---|---|
| **Dev confirmation answer** | clarifies / can't-say / gives-URL | The CSUBJ/ASKURL/CMATCH nodes. A dev supplying a URL mid-flow is an *event*, not a standing value. |
| **Build-completion notification** | exit 0 / nonzero | System event (not dev input) — drives the beat-2 supersede. |

---

## Derived outputs (computed from the above; not inputs)

- **Rung path actually run** — a *subset* of one progressively-materialized clone
  (`sparse README → docs/ → wider sparse → full tree → full history → build → run`),
  from altitude (entry+ceiling) × sufficiency (climb/stop) × supply (skip-cost) ×
  kind (reachable ceiling) × dependency nesting (run⟸build⟸clone). Not every rung runs.
  *(There is no fetch-vs-clone lineage fork — see the README resolution below.)*
- **Truth grade + obligation coverage** — `grade = min(altitude-target, kind-ceiling,
  sufficiency-reached)`. Under run, the claim is scoped not by build-vs-behave but by
  **which of the dev's obligations the run covered** (covered / known-gap / unknown-gap)
  — see the claim-scope resolution below. Plus **completed-unverified** as a distinct
  terminal when a build/run fails.
- **Verification-contract content** — from observability + proxy-trust: the ground-truth
  signal, the lying proxies + why, agent-observable vs human-only, and on delegation the
  proactive "watch X / distrust Y" instruction.
- **Answer + supersede** — beat-1 (fast) and beat-2 (silent confirm or superseding
  correction), driven by pending-correction (drift / deeper-grounding / sharpenable-hedge).
- **Persist-or-not** *(the one deliberate retention decision)* — at each terminal, what
  (if anything) gets written to `~/.tesser/`: the clone at its materialization level, the
  validated map, the build state. This is the only retention choice with cross-run
  consequences, so it's made explicitly, not by default.

## Constraint on the traversal (a requirement, not a dimension)

- **Answer-first latency budget** — beat-1 ≤ ~30s. Why the two-beat exists and why
  model-knows-it + the grounding fetch gate beat-1. The `b40f75e1` 163s failure was a
  budget violation, not a sufficiency one.

## Invariants (corrected)

1. **Cold** paths converge on `ls-remote` (verify + pin) before grounding; **warm**
   (reuse) paths serve offline and defer `ls-remote` to async drift.
2. Reuse-first — check persisted (across-runs) supply before any network.
3. Pin-first — pin = `rev-parse HEAD`, never chase upstream.
4. Credentials = ambient only.
5. No persisted artifact without a clone (`map ⟹ clone`) **for clonable kinds**;
   non-clonable kinds (`hosted-closed`/`sdk`/`heavy-infra`) persist docs-grade fetched
   material governed by `dependency_kind`. **Bundled digests are the named exception**
   (shipped maps, no local clone).
6. Every terminal finalizes the log.

## What survived all the red-teams unchanged

The **cold-path control flow** — the ladder + cold convergence on `ls-remote`. The first
cut over-generalized this one good thing into a universal static-fact model the warm
path, the failures, and the dev-confirmations all contradicted.

---

## Resolved design decisions

### README/docs persistence → uniform sparse-clone (no exception)

The overview-grounding artifact is a **treeless+sparse clone**, not a raw fetch:

```
git clone --depth 1 --filter=blob:none --sparse <url>   # trees, no blobs (~1s)
git sparse-checkout set README.md docs/                  # materialize only what you read
git rev-parse HEAD                                        # the real pin
```

Consequences (why this beats the raw-GET fetch of D47):
- It's a **real clone** → invariant 5 holds with **no exception**; the persisted
  artifact has a clone behind it.
- It's **validatable** (`validate-digest --clone`) → an overview persists a *real
  docs-grade map*, not an unvalidated cache.
- It's the **bottom of the same clone a build would use** → escalating overview→build is
  "widen the sparse-checkout / fetch more blobs" on the *same* clone at the *same* pin.

This collapses three special cases: the fetch-vs-clone **lineage seam**, the invariant-5
**exception**, and the "overviews persist nothing / builds persist maps" **asymmetry**.
One artifact, one pin, one persistence story; the grade axis rides the same clone
(sparse README = docs → sparse source = inspect → build/run = run).

**Amends D47, doesn't reverse it:** D47's motivation (don't pay full-fat-clone cost for
an overview) stands; its *mechanism* (raw GET) rejected the wrong thing — the fat full
clone, not cloning per se. A treeless sparse clone gives the same latency **and** the
uniformity.

Caveats: (1) the ~1s-over-raw-GET latency is an estimate — measure before committing; it
only bites the unknown-dep foreground beat-1. (2) Non-clonable kinds have no repo to
clone — that's not an exception but a `dependency_kind`-keyed branch with a docs-grade
ceiling.

### Claim-scope under run → obligation coverage (not build-vs-behave)

A build never answers anything for the dev — it's instrumental. It's all "run-shaped";
an exit code is an exit code. The axis that matters is **which of the dev's obligations
the run covered**:
- "run a test query to see how hard the basics are" → obligation = *setup-ease*.
- "build with `CC_FLAGS=1` then load-test for perf" → obligation = *perf-under-flag*; the
  build is an invisible prerequisite.

So tesser's claim is never "I built it" — it's "I verified *your obligation* by running
[sequence]; here's what I did **not** cover." That is the **covered / known-gap /
unknown-gap** map CALIBRATED (D40) and the D48 verification-contract already use, pointed
at tesser's own runs. Run-grade stays a single grade; what's scoped is obligation
coverage. **No grade-enum change** — it folds into derived obligation-coverage and the
verification-contract output.

---

## Still open / next

- **The flow itself** — this is only the state variables. The state machine (which
  variable read at which decision, transitions, terminals) is the next artifact, and the
  point of getting these orthogonal first is that the flow becomes a policy over them.
  Part of drawing it is naming the **persist-or-not decision at each terminal** (the one
  deliberate retention choice).
- **Non-clonable-kind branch** — the docs-only grounding path for `hosted-closed`/`sdk`/
  `heavy-infra` is named but not detailed (no git → no sha to pin → how persistence works).
