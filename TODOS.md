# TODOS

Deferred work with context. Items land here only via a review decision; each carries enough context to pick up cold.

## Single-language consolidation (post-v1)

- **What:** Get the repo to ONE implementation language. Today it is split: the runtime scripts are Python (`scripts/validate-digest`, `scripts/log-invocation`, `scripts/setup`) and the test harness is TypeScript/Node (vitest). YAML is parsed by two libraries against the same spec files — PyYAML at runtime, js-yaml in tests (js-yaml is already a devDependency).
- **Principle (Chris, 2026-06-11 Phase-3 close):** one language unless there is a strong reason to add a second to do something specialized the primary language cannot satisfy. Which language wins is NOT decided yet; the requirement is to converge on one.
- **The two candidate end-states:**
  - **All Node/TS:** rewrite the three scripts in TS using js-yaml (already vendored). Deletes the entire D32 install apparatus (venv, `scripts/setup`, `requirements.txt`, the re-exec-into-venv logic, the exit-3 path, `setup.test.ts`) and collapses YAML parsing to one library. Cost: makes Node + `npm install` a RUNTIME requirement for every user (today `package.json` is maintainer-only); stock macOS/Linux ship python3, not Node — so this raises the baseline for the broad audience while lowering it for the Claude-Code cohort. Not a 1:1 port: the validator leans on PyYAML-specific coercion (unquoted ISO timestamps → `datetime` in `check_iso8601_utc`; `bool`-is-subclass-of-`int` in the `exit_code` check) that js-yaml's schema does differently and would need re-validation.
  - **All Python:** drop the Node test harness, rewrite the gates in Python (pytest). Keeps python3's stock-machine ubiquity and the existing scripts; cost is reauthoring 109 gates and losing the spec-as-data symmetry the TS tests currently give.
- **Why it matters:** two languages = two toolchains, two YAML libraries that can disagree on coercion, and a runtime/test split that complicates the install story (D32 exists largely because of it).
- **Depends on / blocked by:** post-v1. Cheapest to act on BEFORE the script set grows — each new script written in the second language raises the porting cost. Decide the winning language as part of this item.

## Footnote-style citation shorthand (⟦n⟧ + references block)

- **What:** Allow short inline `⟦1⟧` markers referencing an end-of-digest block (`⟦1⟧ = ⟦path:Lstart-Lend⟧@sha12`), cutting inline citation noise from ~35 chars to 3.
- **Why:** Readability of dense digests (maintainer concern, 2026-06-11 close review, D7 discussion): a digest with a citation per sentence may read noisy; cleaner artifacts share better.
- **Pros:** Noise reduction with zero loss of validation totality — the reserved `⟦` bracket stays the delimiter, so token-totality still holds (plain `[1]` markers can never have this: digests quote code, code is full of brackets). Dedup: one entry, many refs.
- **Cons:** Grammar restructure (schema, validator dangling-ref/orphan checks, serve-path rewrite, Type-A fixtures all move); two citation forms to maintain.
- **Context:** Design sketch settled in the 2026-06-11 review. D37's charset tightening applies under either grammar. Add an agent-join eval case to T7 (can the consuming agent reliably connect ⟦n⟧ to its entry? hunch: yes — prove it).
- **Depends on / blocked by:** **Trigger = the T9 taste gate**: the maintainer reads every corpus digest there; if they read noisy, that is the demand evidence. Do not build before that verdict.

## Validator robustness hardening against hostile clones/digests (deferred from Phase-3 close review)

- **What:** Two build-ahead robustness items the 2026-06-11 /gstack-review surfaced and Phase 3 deliberately left: (a) `git cat-file blob` in quote-in-range buffers the whole blob into memory with only a time bound — a digest citing a multi-GB file in an untrusted clone can OOM the validator; cap it via `git cat-file -s` size check or a streamed byte ceiling. (b) `scripts/validate-digest` re-execs into `~/.tesser/venv/bin/python3` with no integrity check; since tesser runs untrusted build commands that can write under `~/.tesser/`, a malicious build could plant a binary that every later validator run execs (same-user persistence). Refuse to exec a venv whose layout/`pyvenv.cfg` tesser didn't write.
- **Why:** Both are real, but both live inside v1's accepted untrusted-code posture (design-doc Constraints: tesser adds no confinement of its own; it does nothing the host agent couldn't already do). The OOM needs a crafted digest; the re-exec needs an already-compromised build. Neither blocks the demand experiment.
- **Pros:** Closes a DoS vector and a persistence vector for the one tool whose entire job is operating on untrusted code.
- **Cons:** Build-ahead per the design-doc "no efficiency/safety layer before demand" constraint; the venv-integrity check fights same-user tampering, which is only ever a speed bump.
- **Context:** Findings 1+2 of the Claude adversarial pass + the Codex pass, 2026-06-11 close review. The control-char-crash and replace-ref and clone-lacks-commit findings from the same review were FIXED in the close (not deferred).
- **Depends on / blocked by:** Trigger — OS-level sandboxing arriving with the hosted tier, or the first hostile-digest/clone observed in the wild.

## Digest integrity verification (narrowed by D10/D35)

- **What:** Runtime verification of the `digest_sha256` field that D10 already records at persist/serve time — serve path checks hash before trusting, mismatch = serve-with-warning; possibly signing for shared/published digests.
- **Why:** D35 accepted filesystem trust for v1; D10 added passive hash evidence to the log. The remaining gap is enforcement — currently nothing acts on a mismatch.
- **Pros:** The provenance framing becomes mechanically backed; tamper detection moves from post-hoc analysis to serve time.
- **Cons:** Verification machinery during the demand window is build-ahead (design-doc constraint); hash-in-log already covers the instrument.
- **Context:** See D35 + D10 in the 2026-06-11 close-review record. The log field exists; this TODO is only the verification/enforcement layer.
- **Depends on / blocked by:** Trigger: any digest-sharing feature, multi-user machine support, or post-experiment continuation.

## Post-experiment retention policy for ~/.tesser/ (clones + digests)

- **What:** Design and implement a retention story for `~/.tesser/clones/` and `~/.tesser/digests/` — e.g. delete the superseded clone on explicit refresh, optional size cap with oldest-first eviction.
- **Why:** Pin-first reuse (D28) bounds growth at one clone+digest per library, but residual growth remains: many libraries over months, plus strandings when a dev explicitly refreshes. v1 deliberately cut eviction (2026-06-10 eng review): deletion machinery during a trust experiment risks removing a clone a dev is inspecting, and the design doc forbids building the efficiency layer ahead of demand.
- **Pros:** Bounds disk on long-lived installs; closes the last recurring audit flag about growth.
- **Cons:** Deletion failure modes are real; worthless if the experiment nulls and the skill retires.
- **Context:** The disk-report line (D10 workspace) is v1's disclosure mechanism. Read the pin-first wording in the `idempotent-reuse` clause and the 2026-06-10 eng-review record before starting.
- **Depends on / blocked by:** Experiment outcome — build only if tesser lives past the demand window.

## Cross-commit citations (grammar v2)

- **What:** Re-introduce digest citations whose `@sha12` differs from the frontmatter sha, with defined validator behavior (resolve quote-in-range against the cited commit's tree).
- **Why:** A digest explaining a regression legitimately wants to cite two commits. Grammar v1.1 (D24, 2026-06-10) requires any explicit suffix to equal the frontmatter sha12, so v1 forces cross-commit references into prose (honest but unvalidated).
- **Pros:** Richer digests for the niche-internals questions the corpus seeding is biased toward (D17); validator semantics are well-defined.
- **Cons:** validate-digest must read trees at arbitrary commits (needs the clone present, slower); grammar version bump touches the pinned regex and every Type-A test.
- **Context:** Prose is the deliberate v1 escape hatch — digest authors should not fight the validator. Trigger: the FIRST digest (T9 or cohort) that genuinely needs a cross-commit citation. Build it then, not before.
- **Depends on / blocked by:** T8 validator existing; first real demand instance.

## Experience scoreboard — settle 3 opens + post-dogfood revision pass (D39)

- **What:** `scoreboard.yaml` (D39, drafted 2026-06-12 eng review) is the outcome-anchored measurement contract — three axes (FASTER = time-to-first-answer hard gate <10s ideal/≤30s; TRUER = provenance truth-delta vs the default scored by execution@SHA; DIGESTIBLE = structural-only s2n pins), default agent = null baseline, tesser must beat it across the FULL dep range including simple deps. Two pieces of follow-up land here.
- **Open sub-decisions (in `scoreboard.yaml` open_decisions):**
  - ~~`ttfa_baseline_rule`~~ — **SETTLED 2026-06-12** from 5 scored cells: default = first ≥250-char block (preambles measured 90-135 chars, answers 2900+); tesser must emit a detectable first-answer marker (the rule misfires on its narration). Folded into `faster.baseline_rule`.
  - ~~`noise_ratio_ceiling`~~ — **SETTLED 2026-06-12**: replaced by a placement rule (zero raw `⟦…⟧` above the fold) + a `length_vs_default` check; raw ratio understated the problem ~10×. Folded into `digestible.checks`.
  - `forbidden_lexicon_final` — STILL OPEN. The exact set of internal terms banned from human-facing output (seed list in the file). Needs the maintainer's eye; doubles as tesser's output writing-style contract. Measured leaks: 18 (pyyaml-tesser) / 12 (codeharness-cold) / 6 (codeharness-warm). Blocks the no-leak digestibility check.
- **The revision pass (pre-committed by the maintainer):** lock now, but Chris will dogfood the tool a few times, then we revise the axes/bars against what actually works. So this is a *scheduled re-open*, not just open details. The 2026-06-12 scoring (5 cells, `scoreboard-results.md`) is the first revision input; the **codeharness run-grade-cap finding** (tesser's run-grade is policy-walled on untrusted external clones in the default posture → truth edge structurally thin in v1) is the heaviest open target-redefinition input.
- **Why it matters:** the existing 109 gates test obedience to SKILL.md, not value. This is the only instrument that says whether tesser beats the default. T6/T7 (eval/e2e) get redefined to pin against it.
- **Depends on / blocked by:** the 3 opens are independent and can be settled anytime; the revision pass is triggered by maintainer dogfooding. T6/T7 build should follow, not precede, the post-dogfood revision.
