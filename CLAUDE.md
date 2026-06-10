# tesser

tesser is a Claude Code skill that answers a developer's question about an unfamiliar OSS dependency by cloning, building, and running it at a pinned SHA, with every load-bearing claim cited to file:line.

## Build contract — read before any tesser build session

The canonical build artifacts live on the maintainer's machine. They are local-only and are NOT in this repo:

- Design doc + post-review addendum (D1–D20): `~/.gstack/projects/devindex/chris-evidence-math-cold-start-corrected-design-20260609-161549.md`
- Test plan + decision list + coverage matrix: `~/.gstack/projects/devindex/chris-evidence-math-cold-start-corrected-eng-review-test-plan-20260610-101016.md`
- Tasks JSONL (T1–T9): `~/.gstack/projects/devindex/tasks-eng-review-20260610-103639.jsonl`

Strategy, lineage, and experiment context live in the brain at `projects/tesser` (`~/workspace/brain/projects/tesser.md`) — never in this repo. This file carries implementation state and conventions only.

## Build status (update this ledger as part of each phase's final commit)

| Task | What | Status |
|------|------|--------|
| T1 | Repo scaffold | done (53682ed) |
| T2 | Specs: contract.yaml + digest-schema.yaml | done (0fa8bc8) |
| T3 | scripts/log-invocation + logger tests | next |
| T8 | scripts/validate-digest | next (pairs with T3) |
| T4 | SKILL.md playbook | pending |
| T5 | 13 deterministic gate tests | pending |
| T6 | E2E fixtures + suite | pending |
| T7 | Eval stub (RUN_EVAL-gated) | pending |
| T9 | Digest corpus seed | pending (supervised) |

## Orchestration rules

- One subagent per T-task, EXCEPT: T2 specs and T4 SKILL.md are authored in the main loop (taste-bearing), and T9 pre-runs are always supervised (digests are rubric gold).
- Commit per task, files staged individually; the orchestrating session commits, not subagents.
- Phase checkpoint protocol: pending decision D1 (verification ladder); record it here once decided.

## Repo rules

- All persisted runtime state lives under `~/.tesser/` — never inside this repo.
- `digest-schema.yaml` and `contract.yaml` are spec-as-data: tests pin against them. Change them only with a matching contract decision.
- `SKILL.md` and the spec files are taste-bearing files owned by the main build loop, not subagents.
