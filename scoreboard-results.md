# Scoreboard results — first scoring pass (2026-06-12)

The default column of `scoreboard.yaml`, scored against real sessions, plus the
tesser runs we have. This is data, not spec; the spec it informed is
`scoreboard.yaml` (D39). Five cells: pyyaml, coral, kinesis, caffeinate, and
codeharness (the only *external untrusted clone* — tesser's actual target).

Scored deterministically from the session JSONL (`/tmp/score.py`, a throwaway
probe in the spirit of the evening red-team's `tx.py`; not in the repo — T6/T7
will own the durable scorer).

> **Note (D40, 2026-06-12):** the "TRUER" column below scores JTBD **#1**
> (per-claim correctness vs an execution oracle) — which has since been
> **deferred to v2**. The v1 truth axis is now **CALIBRATED** (JTBD #2 — convey
> how true, never overclaim; see `scoreboard.yaml` axes.calibrated). The #1
> verdicts here are kept as **eval reference data** (they show the bare agent
> was already mostly correct, which is *why* a #1 edge is thin) — not as the v1
> metric. The CALIBRATED re-score is below.

## CALIBRATED re-score (D40 metric, 2026-06-12)

Scored the cells with BOTH columns — pyyaml and codeharness — on the v1 truth
axis: Obligation A (provenance attached), Obligation B (faithful confidence),
and the coverage map (gaps surfaced). A and the lexicon-collision are
deterministic (citation counts, forbidden-term presence); gap-quality and B are
read from the answers and cited, not asserted.

| Answer | len | provenance (A) | calibration mechanism (B) | gaps surfaced |
|---|---|---|---|---|
| pyyaml default | 3,248 | **0 citations** | none — uniform confidence, no recency flag | 0 (overclaimed stale `yaml.load` as current) |
| pyyaml tesser | 9,772 | **14** | 19 grade labels | 1 |
| codeharness default | 10,912 | **0** | none | 5 — genuine + specific (placeholder model IDs, Python-only validation, `git add -A` blast radius) |
| codeharness tesser | 29,404 | **34** | 17 grade labels | 5 (Gemini-key + Postgres gap, well-formed) |

**A — Provenance attachment: decisive tesser win both cells (0→14, 0→34).** The
bare agent attaches no checkable pointer to any claim, even when it read every
file. tesser's one clear, genuine, **auto-mode-surviving** calibration edge —
needs no execution, so the policy wall doesn't touch it.

**Coverage map — roughly tied when the bare agent reads source.** On codeharness
the bare agent produced real, specific, useful gap-flags matching tesser's in
count and quality. Gap-surfacing is NOT tesser's differentiator; a competent
default does it well whenever it inspects. tesser's edge here is
"systematic/reliable vs ad-hoc," not "surfaces gaps the default misses." (On
pyyaml the bare agent flagged nothing and overclaimed the stale `yaml.load`;
tesser caught it — a small real B-win.)

**B — Faithful confidence: tesser has the machinery, but it sabotages itself.**
tesser conveys how-it-knows via explicit grades (`[provisional — inspect-grade]`,
"stays docs/inspect-grade", "upgrade to run-grade") — strictly more systematic
than the bare agent's uniform tone. **But every one of those terms (`run-grade`,
`inspect-grade`, `docs-grade`, `provisional`) is on the forbidden-lexicon list.**
tesser's calibration mechanism IS the digestibility violation; the axes that
should align collide in the current implementation.

**Verdict + rework shape.** tesser's CALIBRATED edge is real but concentrated in
provenance ATTACHMENT, not gap-surfacing, and its B-mechanism currently fails
DIGESTIBLE by construction. So the SKILL.md rework: (1) KEEP systematic per-claim
provenance (the genuine, non-walled edge); (2) TRANSLATE grades into plain
calibration language ("I read this at `models.py:12`" / "recalling from training,
may be stale, didn't verify" / "couldn't run the LLM path — needs a Gemini key")
— fixes Obligation B and the lexicon leak in one move, and couples to the open
`forbidden_lexicon_final` decision; (3) DON'T sell gap-flagging as the
differentiator — the default matches it. Honest meta-point: even reframed,
tesser's edge over a default that reads source is "systematic provenance +
calibration discipline," not "truer answers" — a real but more modest edge than
"fast truth" promised, and the one that survives the permission wall.

Provenance: same sessions as the default column above; tesser pyyaml `db8e01b9`,
codeharness cold `722857bf`. Structural metrics via `/tmp/answer.py`.

## DEFAULT column (the bar tesser must beat)

| Tool | TTFA (first ≥250-char answer) | answer chars | citation-noise | lexicon leak | TRUER (oracle) |
|---|---|---|---|---|---|
| pyyaml | 19.6s | 3,249 | 0.000 | 0 | 12/13 — 1 stale (`yaml.load` RCE, removed 5.1/2019) |
| caffeinate | 25.8s | 2,973 | 0.000 | 0 | ~100% (man page, then run-grade confirmed) |
| kinesis | 47.7s | 5,658 | 0.000 | 0 | unverifiable — cloud service, no execution oracle |
| coral | 63.3s | 4,287 | 0.000 | 0 | 13/14 — 1 self-published benchmark repeated at face value |
| codeharness | 61.4s | 10,829 (incl. a follow-up) | 0.000 | 0 | substantively complete + strong gap-flags; **read the actual source** |

The default is fast, leads with the answer, has zero citation markup, zero
internal jargon. On every clonable repo it *adaptively inspects* (codeharness:
cloned to /tmp, read every file; coral: WebFetched docs). That is the real
competitor — not "the model guessing from memory."

## TESSER column (runs we have)

| Run | TTFA (first real answer) | answer chars | citation-noise | lexicon leak | TRUER |
|---|---|---|---|---|---|
| pyyaml cold (`db8e01b9`) | 79.4s (≥250 rule misfires at 29.3s on narration) | 9,591 | 0.040 | 18 | +1 claim vs default (caught the stale RCE) |
| codeharness cold (`722857bf`) | 107.6s | 29,069 | 0.024 | 12 | **run-grade WALLED → inspect-grade (ties bare)** |
| codeharness warm (`43e3760d`) | 67.8s | 21,645 | 0.044 | 6 | same content, digest cache-served |

## Per-axis findings

**FASTER.** The default wins every cell. Even tesser *warm* on codeharness
(67.8s) is slower to first answer than the bare agent (61.4s) — because tesser's
first five emissions are process narration ("I'll use the tesser skill", "I'll
work through the tesser process", "Log opened ID=fb1e4177", "Found a local
digest", "I have a validated digest") before the answer. Cold is 107.6s, 1.75×
the default. The lever is answer-first, not raw speed: the default is slow on
coral (63s) and kinesis (47s) only because it runs tools sequentially before
answering — so a tesser that answers from a quick read in <10s and defers the
clone could *win* FASTER on exactly those cells.

**DIGESTIBLE.** The default sets the bar at zero on both noise and jargon.
Current tesser leaks 18 / 12 / 6 internal terms, runs 3-5× longer, and leads
with machinery. The raw citation-noise ratio (~0.04) *understated* the problem
~10×; the real killers are lexicon-leak, answer-leads, and length. That
reprioritization is folded into the spec.

**TRUER — the codeharness finding.** On the one external untrusted clone:
- tesser installed deps (run-grade on deps), then was **denied execution** of
  the cloned code by the host auto-mode classifier ("External/Untrusted Code").
  Its production truth ceiling collapsed to **inspect-grade**.
- The bare agent *also* cloned and read every file — inspect-grade too. So the
  truth edge was **~0**, bought at 1.75× latency, 12 jargon leaks, 2.7× length.
- Even the run-grade tesser *could* reach bought near-nothing (maintainer's
  probe): the two credentials-free scripts were the lowest-stakes claims; the
  load-bearing behavior needed a Gemini key + running Postgres, unreachable.

tesser does not control the host permission posture (design: no confinement of
its own), and most devs default to auto-mode. So on tesser's real target the
run-grade differentiator is policy-walled in the common case, and the default
agent already inspects clonable repos — making tesser's truth edge structurally
thin in v1.

## Synthesis

Across five scored cells, the default wins FASTER and DIGESTIBLE everywhere, and
TRUER ties on every inspect-able cell (most of them). The SKILL.md rework
(answer-first, no narration, no jargon, defer the machinery) is the lever for
FASTER + DIGESTIBLE and those are winnable. But truth is a tie wherever the bare
agent also inspects, and tesser's run-grade path to breaking the tie is
policy-walled in the default posture. The honest path to "better than the
default" runs through the two experience axes; truth is occasional-bonus, not
the core differentiator the "truth(er)" framing implied.

This is an observation feeding the open target-redefinition, not a verdict the
maintainer rendered.

## Provenance

- Default: `~/.claude/projects/-Users-chris-workspace-tesserts-without/` — pyyaml `617bdfbb` (from-memory, pyyaml is the 2nd user turn after "hi"), coral `dd430e04`, kinesis `e8ebe946`, caffeinate `f3eb5295`, codeharness `cb07030a`. (Two pyyaml bare sessions `3cfbd91f`/`70389162` died on retries — 0 assistant records.)
- Tesser: `~/.claude/projects/-Users-chris-workspace-tesserts-with/` — pyyaml `db8e01b9`, codeharness cold `722857bf`, codeharness warm `43e3760d`.
- TTFA rule applied: first assistant text block ≥250 chars (default preambles measured 90-135 chars; answers 2,900+). The rule misfires on tesser — see `scoreboard.yaml` faster.baseline_rule.

## Durable scorer (T7a, 2026-06-12)

The throwaway `/tmp/score.py` + `/tmp/answer.py` probes are now superseded by the
durable scorer at `tests/scoreboard/` (`npm run score -- <session> [--vs <baseline>]`).
It reads the bars + forbidden lexicon from `scoreboard.yaml` (spec-as-data) and
reproduces the numbers above — TTFA 19.6s / 3,248-char answer (pyyaml default),
14 provenance pointers + narration-lead + ≥1 gap (pyyaml tesser) — pinned as GOLD
tests against the real A/B sessions (`score.test.ts`).

**One divergence the durable scorer settles:** the lexicon-leak count for
pyyaml-tesser is **24** occurrences over the full human-facing output (run-grade×8,
provisional×8, digest×6, truth-grade×1, cold run×1), not the **18** the lost probe
published. The durable definition (case-insensitive literal-term occurrences across
all assistant text) supersedes the probe; the hard-0 gate fires identically either
way. The 12/6 codeharness counts were probe-era and should be re-derived with the
durable scorer before they are cited again.

**Two items surfaced for a maintainer decision (not changed unilaterally):**
1. **First-answer MARKER** — the scorer looks for `axes.faster.first_answer_marker`
   in `scoreboard.yaml`; it does not exist yet, so tesser TTFA falls back to the
   ≥250-char rule (flagged as a misfiring upper-ceiling). Defining the marker
   string doubles as tesser's `first_answer_shape` contract → a scoreboard edit
   under a D-decision.
2. **`forbidden_lexicon_final`** — still open (the seed list drove the 24-count
   above). Closing it finalizes the hard-0 check.
