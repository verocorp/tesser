# tesser

tesser is a Claude Code skill that answers a developer's question about an unfamiliar OSS dependency by cloning, building, and running it at a pinned SHA, with every load-bearing claim cited to file:line.

## Build contract — read before any tesser build session

The canonical build artifacts live on Chris's machine. They are local-only and are NOT in this repo:

- Design doc + post-review addendum (D1–D20): `~/.gstack/projects/devindex/chris-evidence-math-cold-start-corrected-design-20260609-161549.md`
- Test plan + decision list + coverage matrix: `~/.gstack/projects/devindex/chris-evidence-math-cold-start-corrected-eng-review-test-plan-20260610-101016.md`
- Tasks JSONL (T1–T9): `~/.gstack/projects/devindex/tasks-eng-review-20260610-103639.jsonl`

## Repo rules

- All persisted runtime state lives under `~/.tesser/` — never inside this repo.
- `digest-schema.yaml` and `contract.yaml` are spec-as-data: tests pin against them. Change them only with a matching contract decision.
- `SKILL.md` and the spec files are taste-bearing files owned by the main build loop, not subagents.
