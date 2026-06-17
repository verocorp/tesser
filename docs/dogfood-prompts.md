# Dogfood prompts — the smallest set to prove the bar (grounding-design.md)

Run each from the symlinked workspace so `/tesser` resolves to the live repo, then
score (free, deterministic floor) and judge (LLM eval, skillify step 6).

```bash
cd /Users/chris/workspace/tesserts/with
claude -p "/tesser <prompt>"                 # run it; note the session id it prints / creates
# then, from the tesser repo:
npm run score -- <session-id>                # free deterministic floor (TTFA, answer-leads, leak)
npm run judge -- <session-id>                # LLM eval against the 11 principles
```

(`<session-id>`: newest under `~/.claude/projects/-Users-chris-workspace-tesserts-with/`.)

## The set — each isolates one switch

| # | Prompt | Switch it exercises | Expected |
|---|--------|---------------------|----------|
| 1 | `tell me about zerolog` | **known dep, overview** | recall answer instantly, deepening silent (supersede only if it changes the answer) |
| 2 | `tell me about github.com/verocorp/tesser` | **URL pasted, not in training** (the founding case) | docs fetch *is* the fast first answer, no holding line. (May be private/nonexistent → also tests the can't-reach path. For a clean fetch-path test use a real public unknown repo, e.g. `github.com/sourcegraph/conc`.) |
| 3 | `tell me about Mem0` | **unknown, no URL → search** | honest "searching — paste the URL to skip" (the one gated status line) + the search resolves it |
| 4 | `zerolog vs zap` | **comparison** | fan-out, one comparative answer, partial-result if a leg fails |
| 5 | `does github.com/sourcegraph/conc actually work?` | **does-it-work altitude** | blocks to the run level, the run step delegated, verification-contract |

Start with **1–3** (the recall / fetch / search switching); 4–5 layer on multi-ref and
the run step.

## Known open finding (zerolog, session 9a342f63, 2026-06-17)

Content scored 9 PASS / 1 PARTIAL / 1 FAIL; **weakest = machinery silence (principle 9)**:
the inline `scripts/fetch` made the deepening grounding visible (tool blocks + "let me read
the source" + "everything above holds" + a leaked pin sha). Cause: the converged design's
"main agent calls `scripts/fetch` inline" reintroduces the machinery-visibility the
background-subagent model (D13/D46) had solved. Candidate fix: background the *deepening*
fetch (`scripts/fetch source`), keep only the unknown-dep beat-1 `scripts/fetch docs`
foreground (it's the answer's source). Parked pending the full dogfood pass + Chris's
overall feedback.
