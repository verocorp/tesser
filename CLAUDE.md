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
| T4 | SKILL.md playbook | done (e9c48d4; review fixes ec4fb57) — STUB removed, 17 Type-B gates armed; awaits Phase-3 maintainer taste gate |
| T5 | 19 deterministic gate tests | done (54b415a; +6 review gates 29b66f2; +30 T12 gates 322c33f; +27 T4/review gates → 109 active) — B-gates armed |
| T12 | Spec+code repair: 2026-06-11 close-review decisions D31–D38 + D22 resolution (host-aware digest layout, install-time deps, log/validator semantics) | done (322c33f) — T9 layout unblocked |
| T6 | E2E fixtures + suite | pending — to be redefined to pin against `scoreboard.yaml` (D39) after the post-dogfood revision pass |
| T7 | Eval stub (RUN_EVAL-gated) | pending — becomes the outcome-anchored scoreboard runner (FASTER/TRUER/DIGESTIBLE vs default), not an obedience eval |
| T9 | Digest corpus seed | pending (supervised) |

Phase 1 (T1+T2) closed 2026-06-10: deterministic gates n/a (no tests exist yet), adversarial contract audit passed (a1083d2), code review run at high effort over the full phase diff (10 spec-level findings reported to the maintainer; spec files unchanged pending contract decisions), pushed.

Phase 2 plan eng-reviewed 2026-06-10: findings resolved into contract decisions D21–D30 (T10 carries the spec edits). **D22 (digest SHA-drift semantics on serve) is UNRESOLVED — must resolve before T4 (Phase 3); blocks the SHA-drift e2e only, not T3/T8/T5.** Deterministic gate count amended 13 → 19.

Phase 2 (T10+T11+T3+T8+T5) closed 2026-06-11: deterministic gates green (52 passed, 17 self-armed skips pending T4), adversarial contract audit PASS-WITH-FINDINGS (F1 README/clause-7 contradiction fixed a5f0bb7; F2 the 5-second self-update bound is an accepted authored constant under D23; F4 accepted then closed in 29b66f2), /gstack-review run cross-model over the phase diff (3 confirmed defects + mechanical hardening fixed in 29b66f2), pushed.

Close-review 2026-06-11 (/gstack-plan-eng-review over the parked findings, with Codex outside voice): all ten findings resolved into contract decisions **D31–D38** (host-aware digest layout amending D28's identity key to host + full namespace path; install-time deps via requirements.txt + scripts/setup amending the D1 install story; sha presence rule + logger gate; exit 4 environment failures; v1 trust posture + digest_sha256 logged passive-only; first-schema-valid-finalized-wins join rule; charset + repo-relative path tightening; --clone identity binding), and **D22 RESOLVED: async drift** — serve immediately labeled drift-unchecked, background clone computes, superseding follow-up delivers (the T11-proven mechanic). T12 carries all spec/code edits; full record in the phase2-close-report (verocorp-tesser slug) GSTACK REVIEW REPORT + eng-reviews/tesser-phase2-close-decisions in the brain.

Phase 3 (T12+T4) built 2026-06-11: deterministic gates green (109 passed, 0 skips — the 17 self-armed Type-B gates armed when T4 removed the STUB marker); adversarial contract audit over the T12+T4 diff returned "could not refute completion" (two soft spots fixed: D34 timeout exit-4 gate + digest/hash logger coupling, 5026106); /gstack-review cross-model (testing + maintainability specialists, Claude adversarial, Codex adversarial, red-team) — confirmed defects fixed in ec4fb57 (clone-lacks-commit→exit 4, control-char crash, replace-ref hardening, alias-bomb cap, BOM, drift-clone pin divergence, cold-persist cache-hit metric corruption), two robustness items deferred to TODOS under v1's accepted untrusted-code posture. **Not yet pushed — awaits the Phase-3 maintainer taste gate (Chris reads SKILL.md) before push.** Items surfaced for a maintainer decision (not unilaterally changed): digest selection tie-break formalization (clause-bearing?), whether ≥1 citation is required for a valid digest, and asymmetric logger enforcement (install-failure/completed presence rules — logger-gated vs analysis-side).

Course-correction 2026-06-11→12 (/gstack-office-hours + /gstack-plan-eng-review): the evening red-team of the BARE agent (PyYAML/coral/caffeinate/kinesis) found tesser's experience is worse than the default regardless of question (warm 13.7× slower; on coral — the founding example — bare won 13/14 via WebFetch). Diagnosis (Chris): the 109 gates test OBEDIENCE to SKILL.md, not value. Outcome: **D39 — `scoreboard.yaml`, the outcome-anchored experience contract.** Three axes vs the default-agent null baseline, across the FULL dep range incl. simple deps: **FASTER** (time-to-first-*answer*, UX-TTFR model, hard gate <10s ideal/≤30s — first emission answers now + offers to deepen, not "I'm working on it"), the truth axis (see D40), **DIGESTIBLE** (structural-only s2n pins incl. no-internal-lexicon-leak; functional/completeness scoring rejected). Locked as draft; maintainer will dogfood then we revise (scheduled re-open). T6/T7 redefined to pin against it. The "stop testing setup questions / narrow to a wedge" direction from the evening session was REJECTED by Chris — simple deps must beat the default too.

2026-06-12 scoring + D40 reframe: scored the default column on 5 cells (`scoreboard-results.md`), incl. the first EXTERNAL untrusted clone (Chris McLean's codeharness, with/without A/B). Two opens settled from data (ttfa_baseline_rule asymmetric; noise→placement+length checks). **Codeharness finding:** tesser's run-grade upgrade was DENIED by the host auto-mode classifier ("External/Untrusted Code") — the answer was unchanged (already inspect-grade), so the run-grade differentiator was a *no-op* on its real target. **D40 — truth-axis reframe (Chris):** rename `truer` → **CALIBRATED** and scope v1 to JTBD **#2 (convey how true / calibration: Obligations A provenance + B faithful confidence + the covered/known-gap/unknown-gap map, never overclaim)**, DEFERRING JTBD **#1 (make/verify true — run-grade correctness truth-delta vs oracle) to v2** (where sandboxing/hosted tier unblocks the wall). Grounded in Chris's own locked `originals/trust-a-claim-as-much-as-it-deserves` (#1/#2 split) + `findings-are-max-entropy-distributions` (overstatement = sub-entropy claim). This dissolves the run-grade wall (#2 needs no execution) and aligns all three axes on the short, honest, gap-flagged first answer. A 3-bullet calibrated answer scores HIGHER than a 3k overclaiming one.

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
- `digest-schema.yaml`, `contract.yaml`, and `scoreboard.yaml` are spec-as-data: tests pin against them. Change them only with a matching contract decision.
- `SKILL.md` and the spec files are taste-bearing files owned by the main build loop, not subagents.
