# tesser

tesser is a Claude Code skill that answers a developer's question about an unfamiliar OSS dependency by cloning, building, and running it at a pinned SHA, with every load-bearing claim cited to file:line.

## Build contract — read before any tesser build session

The canonical build-contract artifacts (design doc, test plan, task list) and strategy context live on the maintainer's machine, not in this repo. Maintainers: the routing to those artifacts is in `CLAUDE.local.md` (gitignored, auto-loaded). Build sessions must read the contract artifacts before changing anything; this file carries implementation state and conventions only.

## Build status (update this ledger as part of each phase's final commit)

| Task | What | Status |
|------|------|--------|
| T1 | Repo scaffold | done, pushed (53682ed) |
| T2 | Specs: contract.yaml + digest-schema.yaml | done, pushed (0fa8bc8) |
| T3 | scripts/log-invocation + logger tests | next |
| T8 | scripts/validate-digest | next (pairs with T3) |
| T4 | SKILL.md playbook | pending |
| T5 | 13 deterministic gate tests | pending |
| T6 | E2E fixtures + suite | pending |
| T7 | Eval stub (RUN_EVAL-gated) | pending |
| T9 | Digest corpus seed | pending (supervised) |

Phase 1 (T1+T2) closed 2026-06-10: deterministic gates n/a (no tests exist yet), adversarial contract audit passed (a1083d2), code review run at high effort over the full phase diff (10 spec-level findings reported to the maintainer; spec files unchanged pending contract decisions), pushed.

## Orchestration rules

- One subagent per T-task, EXCEPT: T2 specs and T4 SKILL.md are authored in the main loop (taste-bearing), and T9 pre-runs are always supervised.
- Commit per task, files staged individually; the orchestrating session commits, not subagents.

## Phase checkpoint protocol (decided 2026-06-10, D1 = full ladder)

A phase is done only when every applicable rung passes and the build-status ledger above is updated in the phase's final commit:

1. **Deterministic gates** — every test that exists as of the phase passes.
2. **Adversarial contract audit** — a fresh-context subagent (never the builder) receives the phase's tasks-JSONL lines, the relevant D-decisions, and the phase diff, and attempts to REFUTE "this phase is complete as specified." It returns a per-criterion met / unmet / uncheckable table with file:line citations, plus any silent additions beyond spec. Unmet findings are fixed or explicitly accepted before the phase closes.
3. **Code review** — /gstack-review over the accumulated phase diff before push.
4. **Human taste gate** — Phase 3: maintainer read of SKILL.md; Phase 5: maintainer approves every digest (rubric gold). Other phases: none.

## Repo rules

- All persisted runtime state lives under `~/.tesser/` — never inside this repo.
- `digest-schema.yaml` and `contract.yaml` are spec-as-data: tests pin against them. Change them only with a matching contract decision.
- `SKILL.md` and the spec files are taste-bearing files owned by the main build loop, not subagents.
