# Grounding design (converged 2026-06-17)

**What this is:** the authoritative design for tesser's grounding flow — how tesser
turns a developer's question about an unfamiliar dependency into a calibrated,
source-grounded answer. It **supersedes** the phase/FSM model in `grounding-flow.md`
and the dimension/gatherer/loop mechanics in `grounding-dimensions.md` (both retained
for history; the *Foundation* below carries forward from them unchanged).

**How we got here:** the phase-graph approach (six black boxes; the
gatherer/service/loop taxonomy) was over-built. Pushed on, it collapsed to **two actors
and a deterministic-vs-latent split**, on one realization: the developer is always in
the loop watching a *progressive* answer, so the flow never has to **block on
certainty** — it emits early and the developer redirects. That removes the
reuse/cache/`ls-remote`/verify machinery from the agent's concern (a deterministic
script owns it, opaquely) and removes the confidence-loop apparatus (the developer *is*
the loop). What was an FSM is now: a thin judging agent, fat deterministic fetch
scripts, and one background sub-agent for the slow run step.

---

## Foundation (carried forward — LOCKED kernel, do not re-derive)

From `grounding-dimensions.md`, unchanged:

- **Model knowledge is not categorically different from grounded sources — it is a
  *source of claims*, differentiated only by trust.** (`brain/originals/everything-is-a-claim.md:15`;
  `brain/originals/trust-a-claim-as-much-as-it-deserves.md:144-149` — "weights are a source").
  Re-derived by accident once (2026-06-16); don't again.

- **Working model (fits well, NOT locked — ⚠ don't propagate as gospel):** the
  claim-sources form one trust-ascending ladder **`recall → docs → source → run`**.
  Grounding = climbing it: a higher-trust source either *raises confidence* in the same
  claim (silent) or *contradicts* it (supersede). The upper three grades are spec'd
  (`digest-schema.yaml:70`); "recall as rung 0 of one climbable ladder" is the un-locked
  synthesis. Tag it hypothesis, not finding, in any brain compile.

---

## The model: one agent, deterministic scripts, one background sub-agent

```
MAIN AGENT  (latent — the only thing that thinks; stays responsive)
  · get a git URL          — recall (popular) or dev-pasted; else kick off search
  · decide the first emission and the blocking level (altitude)
  · read docs/source bytes, form claims, answer + update progressively
  · integrate the run-agent's updates; supersede only when the answer changes

DETERMINISTIC SCRIPTS  (the docs/source acquisition — OPAQUE to the agent)
  · docs fetch → source clone ; internal cache ; implicit git URL verification
  · same URL → same bytes. The agent never reasons about cache / cold / warm /
    pin / ls-remote — a binary owns all of it.

BACKGROUND RUN-AGENT  (latent — slow + judgment-heavy; delegated to stay responsive)
  · build / exercise / interpret ; the verification-contract (proxy-trust) lives here
  · streams updates back to the main agent
```

The split is the skillify thesis verbatim — *push intelligence UP into the skill, push
execution DOWN into deterministic tooling, keep the harness thin*
(`~/.gbrain/src/docs/ethos/THIN_HARNESS_FAT_SKILLS.md:92`). The fetch machinery that is
currently brittle prose in `subagent-brief.md §1–§9` (misread as a foreground checklist,
leaked "sleuth"/"drift check") is exactly "deterministic work done in latent space" —
the named bug — and moves into a binary.

---

## The flow

### 1. Get a git URL
- **Recalled** (popular repo, in training) or **dev-pasted** → use it directly. No
  separate verify step; the fetch scripts verify implicitly (git fails on a bad URL).
- **Not recognized and no URL** → kick off a search **and** tell the developer:
  *"I don't recognize this — searching; paste the URL to skip the wait."* The developer
  can short-circuit by pasting.

### 2. First emission (gated honest-status)
- **Repo in training** → answer from recall immediately, calibrated (sure-of vs recalling).
- **URL known (recalled/pasted) but internals unknown** → docs are *fast*, so **stay
  silent** and lead with the docs-grounded answer in seconds. No status line — a "waiting
  on docs" line here is machinery narration (D47 holding-line / judge principle 9).
- **URL unknown → searching** → the honest status from step 1 earns its place, because a
  search is a genuine wait the developer would otherwise see as silence.

The rule: **a status line is only allowed when there is a real wait (a search). Fast
deterministic work stays silent; lead with its result.**

### 3. Progressive, blocking only to the level the question needs
- The scripts/run-agent return claims at rising grades; the agent re-answers **only when
  new info changes the answer** (else silent).
- The one real agent judgment: **what level to block on before answering THIS question**
  (= altitude). An overview blocks on recall+docs and lets source/run stream in as
  updates; a "does it actually work?" blocks until the run-agent returns.
- **Never block on certainty.** Resolution-correctness, subject-match, and sufficiency are
  all handled by *emit early + developer-in-loop*, not by verification gates. The developer
  course-corrects ("wrong repo", "not that one") as normal at any point.

---

## What lives where (the skillify mapping)

| Behavior | Layer | Test ring | Prior-art template |
|---|---|---|---|
| question → reference + altitude + intent | prompt (latent) | B | `skillify-check.ts` |
| get URL: recall/paste → else search | script lookup + prompt fallback | C + B | `fail-improve.ts` |
| **docs fetch · source clone · cache · git verify** | **deterministic script** | **C** + A + integration | `eval.test.ts` + live endpoint |
| form claims from docs/source at altitude | prompt (latent) | D (judge) | `takes-quality-eval/rubric.ts` |
| first emission (recall vs gated honest-status) | prompt | B + D | scoreboard FASTER + judge p1/p9/p10 |
| block-to-level (altitude wait) | prompt judgment | B + D | judge |
| **run: build/exercise/interpret + verification-contract** | **sub-agent** | D (judge p11) | `takes-quality` + `eval-contradictions/judge.ts` |
| trust label (recall/docs/source/run) | **script-stamped tag, not latent self-report** | C + D | `takes-quality` `attribution` dim |
| supersede only when the answer changes | prompt | B + D (p9) | gate 7 |
| developer course-correction → fixture | harness | capture | `fail-improve.ts:121` |

Free A/B/C rings gate every merge; the ~$1 judge (D) runs periodically
(`concepts/testing-agent-skills.md:52`).

---

## Decisions locked this session

1. **Gated honest-status** — status line only when there's a real wait (a search); fast
   docs stays silent and leads with the answer.
2. **The docs/source fetch is a deterministic script**, opaque to the agent (cache, pin,
   verify all script-internal). The agent never sees cold/warm/`ls-remote`.
3. **The run step is a background sub-agent**, not a script (it needs judgment) and not
   inline (it's slow).
4. **Never block on certainty** — emit early, developer in the loop; no resolution/verify
   gate before answering.
5. **The trust label is a deterministically-stamped provenance tag**, set by the layer
   that produced the claim — not the model's free-text self-report (which drifts under
   pressure; `takes-quality-eval/rubric.ts:45-60`).
6. **Every mid-flow developer correction becomes a regression fixture** (`fail-improve.ts:121`),
   not just a better in-session answer.

---

## Superseded by this doc

- `grounding-flow.md` — the six-phase black-box contract (P0–P5, the edge list, the
  three-rail diagram). Replaced wholesale by the two-actor model. The non-linearity it
  tried to wire (reuse skip, `ls-remote` convergence, the back-edges) dissolves: those are
  script-internal now.
- `grounding-dimensions.md` — the Given/Derived/Events + gatherer/service/loop mechanics.
  Replaced; **its Foundation section carries forward** (quoted above).
- F1 (P1/P2 ordering vs invariants) and F2 (Join linearized) — both evaporate: there are
  no phases to order or linearize.

---

## Open / next

- **The deterministic fetch script** — the docs→source acquisition + cache + implicit
  verify (the core "push it DOWN" move). Build + Type-C/integration test first; it's
  eval-independent.
- **Thin SKILL.md / subagent-brief rewrite** — call the script; the gated honest-status;
  progressive updates; brief shrinks to judgment. Built dogfood-by-dogfood (the 5-prompt
  set), gates written *after* the bar is proven.
- **Non-clonable kinds** (`hosted-closed`/`sdk`/`heavy-infra`) — no repo to clone; a
  docs-only branch with its own ceiling. Secondary off-ramp, detailed once the clonable
  mainline holds.
- **Search fallback** — the unknown-bare-name → search path (dogfood #3); deterministic
  search vs a latent search step, TBD when we build it.
