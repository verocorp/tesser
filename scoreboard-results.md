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
> metric. A re-score on the CALIBRATED metric (provenance-attached? gaps
> surfaced? over/under/faithful?) is owed and not yet run.

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
