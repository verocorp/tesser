# tesser

tesser is a Claude Code skill that answers a developer's question about an unfamiliar OSS dependency by cloning, building, and running it at a pinned SHA, with every load-bearing claim cited to file:line.

## Build contract — read before any tesser build session

The canonical build-contract artifacts (design doc, test plan, task list) and strategy context live on the maintainer's machine, not in this repo. Maintainers: the routing to those artifacts is in `CLAUDE.local.md` (gitignored, auto-loaded). Build sessions must read the contract artifacts before changing anything; this file carries implementation state and conventions only.

## Build status (update this ledger as part of each phase's final commit)

| Task | What | Status |
|------|------|--------|
| T1 | Repo scaffold | done, pushed (53682ed) |
| T2 | Specs: contract.yaml + digest-schema.yaml | done, pushed (0fa8bc8) |
| T10 | Spec repair: 2026-06-10 eng-review decisions D21–D30 (log-schema.yaml, grammar v1.1, pin-first, kind slugs, clause 8) | done (4d5cd07) |
| T11 | Spike: background-build→upgrade-in-place flow (D19 mechanics) in a throwaway skill | done (95277d1); clause 7 corrected — "upgrade in place" = superseding follow-up + ~/.tesser/ recovery; report in verocorp-tesser slug |
| T3 | scripts/log-invocation + logger tests | done (32bfd90; hardened 29b66f2) |
| T8 | scripts/validate-digest | done (594602a; hardened 29b66f2) |
| T4 | SKILL.md playbook | next — BLOCKED on D22 resolution; read the T11 spike report's Seeds-for-T4 first; removing the STUB marker self-arms the 17 Type-B gates |
| T5 | 19 deterministic gate tests | done (54b415a; +6 review gates 29b66f2) — B-gates self-arm when T4 lands |
| T6 | E2E fixtures + suite | pending |
| T7 | Eval stub (RUN_EVAL-gated) | pending |
| T9 | Digest corpus seed | pending (supervised) |

Phase 1 (T1+T2) closed 2026-06-10: deterministic gates n/a (no tests exist yet), adversarial contract audit passed (a1083d2), code review run at high effort over the full phase diff (10 spec-level findings reported to the maintainer; spec files unchanged pending contract decisions), pushed.

Phase 2 plan eng-reviewed 2026-06-10: findings resolved into contract decisions D21–D30 (T10 carries the spec edits). **D22 (digest SHA-drift semantics on serve) is UNRESOLVED — must resolve before T4 (Phase 3); blocks the SHA-drift e2e only, not T3/T8/T5.** Deterministic gate count amended 13 → 19.

Phase 2 (T10+T11+T3+T8+T5) closed 2026-06-11: deterministic gates green (52 passed, 17 self-armed skips pending T4), adversarial contract audit PASS-WITH-FINDINGS (F1 README/clause-7 contradiction fixed a5f0bb7; F2 the 5-second self-update bound is an accepted authored constant under D23; F4 accepted then closed in 29b66f2), /gstack-review run cross-model over the phase diff (3 confirmed defects + mechanical hardening fixed in 29b66f2), pushed. **Ten contract-level review findings are parked for decisions before/with T4 and T9 — recorded in the 2026-06-11 phase-close report (verocorp-tesser slug); the two most urgent: org--repo filename delimiter ambiguity (D28 encoding — must resolve BEFORE T9 bakes filenames) and PyYAML availability on cohort machines (validate-digest exits 3 → no digest ever persists).**

## Decision namespaces

Bare `Dn` in spec files and build artifacts = the canonical design/test-plan decision list (D1–D20 in the design-doc addendum; new contract decisions continue at D21+). Repo-process decisions use a `Pn` prefix going forward. Commit messages before 2026-06-10 ("D1 = full ladder", "D2=A", "D3" routing split) predate this convention and refer to the process list, not the canonical one.

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
