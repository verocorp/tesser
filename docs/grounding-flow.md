# Grounding flow — black-box phase contract

> ⚠ **SUPERSEDED 2026-06-17 by `grounding-design.md`.** The six-phase model here
> (P0–P5, the edge list, the three-rail diagram) is replaced by the two-actor design
> (main agent + deterministic fetch scripts + background run-agent). Retained for
> history. The reuse / `ls-remote` / back-edge wiring is now script-internal; F1 and F2
> dissolved.

**What this is:** the *wiring* of the grounding flow — each phase as a **black box**
(Entry / Consumes / Emits / Exits), with internals deliberately left opaque. The point is
to pin the inter-phase edges first (where the non-linearity lives) so each phase's
internals become swappable, and to get the **free structural check** (every exit lands
somewhere, every phase reachable, every terminal ends, every dev-question returns) before
any internals exist.

**Reads from:** `grounding-dimensions.md` (the state variables — Given / Derived / Events;
the gather→join concurrency model; the working-model claim-ladder). Dimension names below
refer to that doc.

**Status:** wiring draft. Internals are TBD (the next increment, per phase). The
claim-ladder it rests on is a working model, not locked (see the dimensions doc).

**Rendered view:** `grounding-flow.html` (open in a browser) shows the graph, generated
from the edge list below via `grounding-flow.dot` → `grounding-flow.svg`
(`dot -Tsvg grounding-flow.dot -o grounding-flow.svg`). Graphviz, not Mermaid — Mermaid's
dagre layout tangled the back-edges. The `.dot` is the picture's source; this doc's edge
list is the design's source.

---

## The six black boxes

| Box | One line | Is it a gatherer? |
|---|---|---|
| **P0 · Interpret** | dev question → {reference(s), altitude, cardinality} + recall claims | yes — the `recall` gatherer |
| **P1 · Resolve** | reference → verified identity + pin | no — enables the higher gatherers |
| **P2 · Reuse** | identity → what prior runs left on disk | no — reads persisted gatherer output |
| **P3 · Gather** | climb the ladder; emit `docs`/`inspect`/`run` claims | yes — the fetch/clone/build/run gatherers |
| **P4 · Join** | assemble claims → the calibrated answer | no — the synthesizer (fired ≥1×) |
| **P5 · Terminal** | grade, persist-or-not, finalize log | no — closes the run |

---

## Per-phase contracts

### P0 · Interpret  *(= the recall gatherer)*
- **Entry:** the dev's question arrives.
- **Consumes:** the question *(Given)*; model weights → `model-knows-the-dep?`,
  `dependency_kind` (proposed), recall-grade claims about each ref.
- **Emits:** `{reference + subject-provenance, altitude, cardinality}` per ref, plus the
  recall claim-set (possibly empty for an unknown dep).
- **Exits:**
  - subject ambiguous → **`CSUBJ` event** → (clarified) → P1 · (can't say) → P5:unresolvable
  - cardinality N>1 → **fan out**: run P1→P3 per ref, **fan-in at P4**
  - else → **P1** (per ref)
- **Guards:** no network.
- **Note:** for a *known* dep, the recall claim-set already clears the beat-1 bar → P4 can
  fire immediately (foreground/background cut at the very top). For an *unknown* dep, recall
  is thin → beat-1 waits on P3's first rung.

### P1 · Resolve  *(verified identity + pin; enables higher gatherers)*
- **Entry:** a reference + its provenance.
- **Consumes:** reference form (classify), URL-provenance, `dependency_kind` (confirm);
  network: registry / search / `ls-remote`.
- **Emits:** verified **identity + pin**, with working-URL-provenance carried.
- **Exits:**
  - resolved + pinned → **P2**
  - 404, provenance=recalled → **re-search** (internal loop in P1)
  - 404, provenance=dev-given → (S8 ambient-creds retry) → P5:can't-reach
  - search empty / no confident pick → **`ASKURL` event** → (URL) → P1·verify · (no) → P5:unresolvable
- **Guards:** **cold converges on `ls-remote`; pin-first.**

### P2 · Reuse  *(read persisted gatherer output; reuse-first)*
- **Entry:** identity + pin.
- **Consumes:** `local supply` (clone/map/build), `prior truth_grade`, `drift` *(across-runs, from disk)*.
- **Emits:** a reuse decision.
- **Exits:**
  - **map-hit** → **P4** (serve warm — the map *is* prior gather output; **skips P3**) + async drift
  - **clone-hit** → **P3** (acquisition pre-paid; enter the ladder with the clone present)
  - **miss** → **P3** (cold)
- **Guards:** **reuse-first (before any further network); warm serves offline** — this is
  the one path that does *not* hit `ls-remote` before answering.

### P3 · Gather  *(climb the source ladder; the docs/inspect/run gatherers)*
- **Entry:** identity + pin (± a clone from P2).
- **Consumes:** `altitude` (entry rung + ceiling), `dependency_kind` (ceiling),
  `sufficiency` loop, `observability` + `proxy-trust`; process: sparse-clone widen / build / run.
- **Emits:** claims at rising grades (`docs → inspect → run`), each tagged with its source.
- **Exits:**
  - each materialization → **feeds P4** (beat-1 when the budget hits; higher grades as they return)
  - corroboration mismatch → **`CMATCH` event** → (yes) continue · (no) → **P1** (re-resolve, **back-edge**) · (URL) → P1·verify
  - build/run nonzero exit → **P5:completed-unverified** (the claim stands at the lower grade)
  - reached ceiling = `min(altitude, kind, sufficiency)` → done gathering → P4/P5
- **Guards:** **kind-ceiling caps; pin held throughout.**
- **Concurrency:** foreground until beat-1's gatherer returns; **background after** (the
  deeper climb runs behind the delivered answer).

### P4 · Join  *(the synthesizer — fired ≥1×; NOT a phase "after" P3)*
- **Entry:** ≥1 claim exists (recall alone suffices for a known-dep beat-1).
- **Consumes:** all claims gathered so far (across grades; **across refs** for a comparison);
  the obligations — trust-as-deserved, covered/known-gap/unknown-gap, faithful confidence.
- **Emits:** the **answer** (beat-1), a **supersede** (beat-2), or **silence**.
- **Exits:**
  - first fire → **emit beat-1**; P3 continues in background
  - a higher-grade claim **changes** the answer → **beat-2 supersede**
  - a higher-grade claim **agrees** → silent (no emission)
  - gathering complete + joined → **P5**
- **Constraint:** beat-1 ≤ ~30s latency budget.

### P5 · Terminal  *(grade, persist, finalize)*
- **Entry:** gathering complete, or an early-exit terminal reached.
- **Consumes:** deepest grade reached, obligation coverage, what's on disk.
- **Emits:** `truth_grade = min(altitude, kind, sufficiency)`; **persist-or-not** (write
  clone/map/build to `~/.tesser/` — the one deliberate retention call); finalize log.
- **Exits:** end.
- **Guards:** **every terminal finalizes the log; `map ⟹ clone` on persist (clonable kinds).**
- **Reached from:** P1 (can't-reach, unresolvable), P3 (completed-unverified), P4 (answered).

---

## Consolidated edge list

```
P0 → CSUBJ → P1 | P5:unresolvable
P0 → P1                                   (per ref; N>1 fans out → fan-in at P4)
P1 → P2                                   (resolved + pinned)
P1 → P1                                   (404 + recalled → re-search)
P1 → P5:can't-reach                       (404 + dev-given, after S8)
P1 → ASKURL → P1·verify | P5:unresolvable
P2 → P4                                   (map-hit; SKIPS P3)
P2 → P3                                   (clone-hit or miss)
P3 → P4                                   (each materialization feeds the join)
P3 → CMATCH → P3 | P1 (back-edge) | P1·verify
P3 → P5:completed-unverified              (build/run nonzero)
P4 → P4'                                  (beat-2 re-fire, async)
P4 → P5                                   (joined + gathering done)
```

## Concurrency cut (the only real parallelism)

One pipeline (`P0→P1→P2→P3`) with the **joiner (P4) tapping it ≥1 times.** The
foreground/background line is exactly **where beat-1 fires**:
- **known dep** → beat-1 at P0 (recall); *all* of P1→P3 runs background → beat-2.
- **unknown dep** → beat-1 after P3's first rung (sparse-README, foreground); the deeper
  climb runs background → beat-2.

`model-knows-the-dep?` only moves this cut. There is no second track to synchronize.

## Wiring validation (the free structural check)

- **Every exit lands:** ✓ each arrow above terminates at a phase, a terminal, or an event
  that returns to a phase.
- **Every phase reachable:** P0 entry; P1←P0; P2←P1; P3←P2; P4←P0/P2/P3; P5←P1/P3/P4. ✓
- **Every terminal ends:** P5 variants (unresolvable, can't-reach, completed-unverified,
  answered) have no out-edges. ✓
- **Every dev-question returns:** `CSUBJ`→P1/P5, `ASKURL`→P1/P5, `CMATCH`→P3/P1. ✓ (no
  dangling confirmation)
- **Open seam to check by hand:** the back-edge `P3 → P1` (CMATCH "no") re-enters identity
  resolution — confirm it re-enters *before* `ls-remote` (so the new candidate gets
  verified+pinned), not after.

---

## Still TBD (next increments)
- **Each phase's internals** (the actual steps inside the box) — detailed per phase, now
  that the wiring holds.
- **The non-clonable-kind branch** — P1/P3 for `hosted-closed`/`sdk`/`heavy-infra` (docs
  from a site, no git → no sha to pin).
- **Per-terminal persist-or-not** — exactly what each P5 variant writes to `~/.tesser/`.
