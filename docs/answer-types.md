# tesser answer-type taxonomy

Derived by reading across `answer-corpus.md` (42 `/tesser`-invoked sessions). Goal: the **minimal MECE
set** of distinct ANSWER TYPES tesser has actually produced — mutually exclusive (each session lands in
exactly one), collectively exhaustive (every session is covered).

Classification rule for multi-turn sessions: **classify by the first JTBD the developer asked tesser to
satisfy** (its opening intent / altitude), not by every tangent the conversation later wandered into. A
session that opens as an overview and is *escalated* by the dev into a build is recorded under its escalated
terminal altitude only when the escalation is the dominant body of the session (noted per case below).

The taxonomy crosses three axes that the corpus actually exercises:

- **Question intent / altitude** — orient (overview) · explain-a-concept · compare · does-it-work · make-it-work · verify-a-plan · locate.
- **Knowledge state** — known-from-training · unknown-needs-fetch · unreachable/non-existent.
- **Answer shape** — single answer · status-line-then-supersede · build-report-then-upgrade · honest-can't-find · correction-of-a-prior-claim.
- **Calibration grade** — docs-grade (read README/docs) · inspect-grade (read source at a pinned sha) · run-grade (built & ran it).

---

## The types

### T1 — Single knowledge overview
**Definition.** "Tell me about X / how does X work" for a dependency the model knows (or can read), answered
in **one** leading plain-language answer (mental model + how-it-works + a gotcha), with the background
grounding either confirming silently or adding a small inspect-grade refinement — no holding line, no
direction-reversing supersede.
**Knowledge state:** known-from-training (or quickly read). **Grade:** docs-/inspect-grade.
**Exemplars (17):** `9a342f63` (zerolog), `9fa40752` (mosh), `d8ba90e1` (Letta), `5814638c` (p-limit),
`6d760f0c` (Mem0), `28f2d055` (pi), `aae0d93c`/`d3b454d7` (gds-agent), `db8e01b9`/`6832a756` (PyYAML),
`53f3b2d6`/`8c3e1d7b` (tesser-on-itself, short), `3e0740d7` (Letta, forced-spawn), `d5eec575` (neo4j GDS,
later escalated — see gaps), `91677145` (neo4j gds, escalated), `bebf09d9`/`bfb29d96` (conc overview).
**Good shape.** First emission *is* the answer: a one-line "it's like X but Y" mental model, then the
mechanism in 2-3 beats, then one real gotcha. If grounding changes nothing, it stays silent; if it adds a
detail, a short "confirmed against source (pinned at `sha`), plus one thing worth adding" follow-up.

### T2 — Status-line → grounded supersede
**Definition.** Dep the model does **not** reliably know. Beat 1 is an honest holding/acknowledgment line
("I don't recognize X, reading the source now"); the real grounded answer lands as a later **superseding**
emission. (This is the shape FASTER penalizes when the holding line is all the dev gets for a long time.)
**Knowledge state:** unknown-needs-fetch. **Grade:** docs-grade (README), labeled as such.
**Exemplars (3):** `75a66d4e`, `ab3d6727`, `b40f75e1` (all `verocorp/tesser` — the founding meta-case).
**Good shape.** Beat 1 names the uncertainty + flags the ambiguous-404 caveat in one sentence and promises a
grounded follow-up; beat 2 **leads with the corrected fact** ("Going by its README, X is …"), never narrates
the act of grounding. The known failure mode: the holding line carries no substance and TTFA is really the
supersede (the b40f75e1 163s case).

**Post-fix update (2026-06-18).** The three exemplars all predate the D47/readme-first fix and the
2026-06-18 steering walk-back — they document the *broken* shape (a holding line is beat 1, the real answer is
the late supersede). The **target** shape for the unknown+URL case is now: the docs-grounded answer **leads**
in beat 1 (no holding line) — `scripts/fetch docs` is the one licensed foreground step because the docs *are*
the answer's source. Fixed exemplar: `b0ef6158` (`verocorp/tesser`, warm cache, 2026-06-18) — fetch fires at
7.8s, the real docs-grade answer leads at 34.3s, no holding line (vs the 83–113s holding-line runs it
replaces). The holding/status line survives **only** for the no-URL case (then it is T6's opening, and may
resolve to T6 not-found or to a found-and-superseded T2).

### T3 — Comparison
**Definition.** "X vs Y" / "how does X compare to Y" — two or more deps weighed on shared axes, with a
when-to-pick-which verdict.
**Knowledge state:** mixed (often known, sometimes one private/unreachable). **Grade:** docs-/inspect-grade.
**Exemplars (5):** `7311e5fb`/`15769959` (zerolog vs zap), `6e0aea27` (zerolog vs zap), `617e9e78`
(codeharness vs pi), `43e3760d`/`722857bf` (codeharness "how it works" escalated into a harness-landscape
comparison).
**Good shape.** Lead with the shared frame ("both solve fast structured logging, you pick one *instead of*
the other"), then the **axis-by-axis** difference (API shape, perf, ecosystem), then an explicit "pick X when
…, pick Y when …". Calibrate which side is recalled vs verified; if one repo can't be reached, say "can't
reach it" (never "doesn't exist") and compare the reachable one honestly.

### T4 — Does-it-work (verify by running)
**Definition.** "Does X actually work?" — tesser builds and runs the dependency's **own** test suite / build
at a pinned sha and reports run-grade evidence.
**Knowledge state:** usually known, but the *value* is the run. **Grade:** run-grade (upgrade from recall).
**Exemplars (3):** `21c2dc80`, `ea2384eb`, `ea13ba96` (all `sourcegraph/conc`).
**Good shape.** Lead with the recalled answer calibrated as recall ("yes, I know this one — short version:
…"), then a superseding **"Confirmed by running it"** block: pinned sha, `go build` / `go test` (and `-race`
for a concurrency lib) results with counts, explicitly upgrading "I recall" → "I watched it work."

### T5 — Make-it-work build report (+ verification contract)
**Definition.** "Get X running and confirm it executed" / "did my task actually run?" — tesser sets up and
drives the dependency to do real work, then ships the **verification contract**: the ground-truth signal, the
lying proxies (e.g. Celery `PENDING` / HTTP 200 / exit 0) and *why* they lie, and — on delegation — a
proactive "watch X, distrust Y" instruction.
**Knowledge state:** known mechanics, run-grade proof. **Grade:** run-grade. **Shape:** build-report.
**Exemplars (6):** `04730486` (huey), `07d07334`/`20f3a97f`/`87cbc7ab`/`b4ce2e2d`/`fcbd0e5c` (celery
`PENDING`-is-lying family).
**Good shape.** Lead with the proof, not a description of it ("Done — I watched it execute, here's the
proof"); when the dev's own signal is misleading, **proactively** volunteer the distrust warning even if they
never named it ("`.status` stays PENDING even though the task ran — don't trust it; watch the worker log /
`result.get()` instead"). Failure mode = the *half-contract* (right positive signal, buried-or-missing
distrust signal).

### T6 — Honest can't-find / unreachable
**Definition.** The named thing isn't a findable open-source dependency (typo, non-existent, or
private/unreachable) — tesser says so plainly and offers the closest real candidates + how to disambiguate,
without inventing an answer.
**Knowledge state:** unknown → confirmed-not-found. **Grade:** n/a (no artifact).
**Exemplars (1):** `992dafdb` (yousou).
**Good shape.** Beat 1: "I don't recognize it, searching — paste a URL to skip the wait." Beat 2: "I can't
find a dependency named X on npm/PyPI/crates/GitHub; the only near hit is …; possible typos are …" — an
honest null result with disambiguation, never a confabulated description.

### T7 — Concept / doc explainer (ELI-style)
**Definition.** "ELI10 / explain this concept or evaluation document" — orient the dev to an idea or a
doc/spec by reading the real source and re-explaining it plainly, rather than describing a single library's
API.
**Knowledge state:** unknown-needs-fetch (named thing must be resolved). **Grade:** docs-/inspect-grade.
**Exemplars (3):** `4fe7e393`/`70de81a7` (Stof "evaluation document"), `0a395cf9` (gbrain skillify vs
gstack skills — multi-repo source read).
**Good shape.** Resolve the (possibly mis-named) thing, then a genuinely simple framing ("Stof is JSON that
can also *do stuff*"), grounded in source; for cross-repo "is A like B?" questions, end with a direct
bottom-line verdict.

### T8 — Correction of a prior guess / dead-end
**Definition.** tesser is pointed at a prior session / running thread that asserted a load-bearing fact as a
guess, and its source read **overturns** it — the answer's value is the correction itself.
**Knowledge state:** prior-claim-was-wrong → grounded-fix. **Grade:** inspect-/run-grade.
**Exemplars (2):** `0d3b1734` (HA→Alexa: prior session guessed "matches by spoken utterance" — backwards;
tesser corrects to name-first, case-insensitive from source), `e6bc5ee7` (hallucination-detector question;
leads by overturning the question's hidden assumption).
**Good shape.** Lead with the corrected fact and *why the prior claim was wrong*, sourced; never narrate the
act of grounding. On a does-it-work/make-it-work correction, ship the verification contract too (the
0d3b1734 half-contract is the cautionary anchor).

### T9 — Verify an external plan / assumptions
**Definition.** The dev hands tesser a **plan or described system** (not just a repo name) and asks it to
proceed; tesser grounds the plan's load-bearing assumptions (package names, env vars, whether a feature
exists) against real source before/while executing.
**Knowledge state:** claims-to-verify. **Grade:** inspect-/run-grade.
**Exemplars (1):** `a2889b0a` (Ollama/MiniLM/GPT-4o benchmark plan — grounds the package name,
`MEMENTO_LLM_PROVIDER`, and whether a 3-way recall comparison ships, then runs the full 500-question eval).
**Good shape.** Lead by naming which load-bearing claims you'll verify and why, verify them against source,
flag any that don't hold *before* the expensive run, then report the real result.

---

## MECE accounting

| Type | Count | Sessions |
|------|------:|----------|
| T1 Single knowledge overview | 17 | 9a342f63, 9fa40752, d8ba90e1, 5814638c, 6d760f0c, 28f2d055, aae0d93c, d3b454d7, db8e01b9, 6832a756, 53f3b2d6, 8c3e1d7b, 3e0740d7, d5eec575, 91677145, bebf09d9, bfb29d96 |
| T2 Status-line → supersede | 3 | 75a66d4e, ab3d6727, b40f75e1 |
| T3 Comparison | 6 | 7311e5fb, 15769959, 6e0aea27, 617e9e78, 43e3760d, 722857bf |
| T4 Does-it-work (run) | 3 | 21c2dc80, ea2384eb, ea13ba96 |
| T5 Make-it-work build report | 6 | 04730486, 07d07334, 20f3a97f, 87cbc7ab, b4ce2e2d, fcbd0e5c |
| T6 Honest can't-find | 1 | 992dafdb |
| T7 Concept / doc explainer | 3 | 4fe7e393, 70de81a7, 0a395cf9 |
| T8 Correction of a prior guess | 2 | 0d3b1734, e6bc5ee7 |
| T9 Verify an external plan | 1 | a2889b0a |
| **total** | **42** | |

Every session maps to exactly one type (mutual exclusion); all 42 are covered (collective exhaustiveness).

---

## Taxonomy gaps & under-tested cases

**Sessions that don't fit cleanly (multi-intent / escalation seams):**

- **`d5eec575`, `91677145`, `43e3760d`/`722857bf`** open as an overview/orient (T1) and the dev *escalates*
  them into a build (d5eec575: neo4j GDS overview → builds a custom Pregel plugin, ~660s, run-grade) or a
  comparison (91677145 gds → compared to gds-agent; 43e3760d codeharness "how it works" → harness landscape
  + Pi-history comparison). They are filed by their dominant body, but they prove a single session can span
  **two** types. A cleaner instrument would tag a session with a *primary* and an *escalated* type. This
  altitude-escalation (overview → set-up → does-it-work → make-it-work) is the spectrum the SKILL.md altitude
  router is built around, and it is the principal source of cross-type ambiguity in the corpus.
- **`722857bf`** is the weakest single-label fit: it never grounded its named repo (codeharness was private /
  didn't clone) and pivoted entirely into a coding-harness landscape debate — placed in T3 by its terminal
  body, but it's really "overview-that-couldn't-ground → free-form comparison."
- **T2 vs T6 boundary** is knowledge-state-dependent, not intent-dependent: both start "I don't recognize
  X" — T2 *finds* it (verocorp/tesser exists) and supersedes; T6 *doesn't* (yousou) and reports a null. They
  are distinct outcomes of the same opening move; a session can only be classified after the fetch resolves.

**Types conspicuously thin or absent (under-tested):**

- **T6 Honest can't-find (n=1)** — only one true not-found case (yousou). The private/unreachable variant
  ("can't reach it, 404 ≠ doesn't exist") shows up *inside* T2/T3 (b40f75e1's caveat, 617e9e78's codeharness
  credential prompt) but never as a standalone session. The overclaim guard ("doesn't exist" vs "can't
  reach") is therefore barely exercised on its own.
- **T9 Verify an external plan (n=1)** and **T8 correction (n=2)** are nearly singletons — high-value,
  low-coverage. The T8 corpus has *one real* dead-end-correction (0d3b1734) plus one assumption-overturn
  (e6bc5ee7); the headline half-contract failure lives in 0d3b1734 alone (the GOLD anchor).
- **A pure "locate-a-detail"/pinpoint type is absent.** No session asks "where in X is feature F / which file
  implements Y / what's the default for option Z" answered with a single file:line citation. Given tesser's
  cite-to-file:line contract, this is a plausible JTBD that the corpus never tests.
- **Comparison with run-grade evidence is absent.** Every T3 is docs-/inspect-grade reasoning; none *runs*
  both contenders to compare measured behavior (the wall-finder-style empirical comparison). Comparisons stop
  at "what I know," never "what I measured."
- **No multi-dependency / "which of these N should I use" selection** beyond pairwise comparison.
- **Calibration-grade skew:** the corpus is dominated by docs-/inspect-grade overviews (T1 = 40%); run-grade
  only appears in the does-it-work (T4) and make-it-work (T5) families and the two escalated overviews. The
  CALIBRATED truth axis is well-exercised on the make-it-work/verification-contract side and thinly on
  everything else.
