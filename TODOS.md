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

- **What:** `scoreboard.yaml` (D39, drafted 2026-06-12 eng review; truth axis reframed D40) is the outcome-anchored measurement contract — three axes (FASTER = time-to-first-answer hard gate <10s ideal/≤30s; **CALIBRATED** = JTBD #2 convey-how-true: provenance + faithful confidence + covered/known-gap/unknown-gap map, never overclaim — JTBD #1 run-grade correctness **deferred to v2**; DIGESTIBLE = structural-only s2n pins), default agent = null baseline, tesser must beat it across the FULL dep range including simple deps. Two pieces of follow-up land here.
- **Open sub-decisions (in `scoreboard.yaml` open_decisions):**
  - ~~`ttfa_baseline_rule`~~ — **SETTLED 2026-06-12** from 5 scored cells: default = first ≥250-char block (preambles measured 90-135 chars, answers 2900+); tesser must emit a detectable first-answer marker (the rule misfires on its narration). Folded into `faster.baseline_rule`.
  - ~~`noise_ratio_ceiling`~~ — **SETTLED 2026-06-12**: replaced by a placement rule (zero raw `⟦…⟧` above the fold) + a `length_vs_default` check; raw ratio understated the problem ~10×. Folded into `digestible.checks`.
  - `forbidden_lexicon_final` — STILL OPEN. The exact set of internal terms banned from human-facing output (seed list in the file). Needs the maintainer's eye; doubles as tesser's output writing-style contract. Measured leaks: 18 (pyyaml-tesser) / 12 (codeharness-cold) / 6 (codeharness-warm). Blocks the no-leak digestibility check.
- **The revision pass (pre-committed by the maintainer):** lock now, but Chris will dogfood the tool a few times, then we revise the axes/bars against what actually works. So this is a *scheduled re-open*, not just open details. The 2026-06-12 scoring (5 cells, `scoreboard-results.md`) is the first revision input; the **codeharness run-grade-cap finding** (tesser's run-grade is policy-walled on untrusted external clones in the default posture → truth edge structurally thin in v1) is the heaviest open target-redefinition input.
- **Why it matters:** the existing 109 gates test obedience to SKILL.md, not value. This is the only instrument that says whether tesser beats the default. T6/T7 (eval/e2e) get redefined to pin against it.
- **Depends on / blocked by:** the 3 opens are independent and can be settled anytime; the revision pass is triggered by maintainer dogfooding. T6/T7 build should follow, not precede, the post-dogfood revision.

## First-answer readability / scannability (Letta dogfood 2026-06-14)

- **What:** Improve the visual formatting of the beat-1 first answer for scannability. Today it lands as a wall of text — the p-limit/zerolog/Letta runs all produced 2000-2500-char prose blocks that read dense even when the content is right. Wants structure (bolded lead, short paragraphs or bullets, a clear what-it-is / how / setup rhythm) so a developer can skim it in 3 seconds, not read a paragraph.
- **Why:** DIGESTIBLE is a v1 axis, and "leads with the point, fast, plain" is the bar tesser is graded against. A correct answer that reads as a slab still loses to the default on perceived speed-to-understanding. The deterministic scorer currently checks length + answer-leads + leak, but NOT internal structure/scannability — so this is invisible to the instrument today.
- **Pros:** Directly lifts the perceived quality of every overview; cheap (an Output-contract formatting rule + maybe a structural gate counting paragraph/bullet breaks vs char count).
- **Cons:** Over-structuring can feel templated; the formatting rule has to scale down for a 2-sentence answer (don't bullet a one-liner). Adds a scoring dimension that's part taste.
- **Context:** Raised by Chris reviewing the 2026-06-14 Letta runs (d8ba90e1 et al.). Pairs with the voice/tone item below — both are "how the answer reads", not "is it correct". The judge does not currently grade scannability either; if built, add a principle.
- **Depends on / blocked by:** not now (Chris explicitly deferred). Natural to pick up alongside the voice/tone item and a judge-principle pass.

## Voice/tone: progressive enhancement, not "I was wrong" (Letta dogfood 2026-06-14)

- **What:** Reframe the supersede's voice from correction/error to progressive enhancement. The beat-2 follow-up should read as "here's a quick answer" → "oh good, better info just arrived", NOT "what I told you was wrong, here's the fix". Same for calibration generally: the tone is a confident fast first pass that then sharpens, not an apology. The split-second-fix done this round (lead with the fact, don't narrate the act of grounding) is the mechanics; this item is the *register/voice* on top of it.
- **Why:** The two-beat is a feature (fast answer now, verified sharpening moments later) — the voice should sell it as such. Framing it as self-correction makes tesser sound unreliable when it's actually doing the honest thing the default agent can't. Voice is also the writing-style contract (overlaps the `forbidden_lexicon_final` open in the scoreboard item).
- **Pros:** Turns the supersede from a wart into the headline differentiator; aligns with CALIBRATED (faithful confidence presented well, not anxiously).
- **Cons:** Register is taste-heavy and hard to pin with a deterministic gate — likely an LLM-judge principle, not a structural one. Risk of swinging too breezy and underplaying a real correction.
- **Context:** Raised by Chris on the 2026-06-14 Letta eval, distinct from the now-done "don't narrate the act of grounding" mechanical fix. He wants it tracked, not built now. Best landed as a judge principle + an Output-contract voice note, calibrated against his judgments (the P4 LLM-judge-trained-on-his-corpus plan).
- **Depends on / blocked by:** not now (deferred). Pairs with the readability item and the `forbidden_lexicon_final` / writing-style work.

## Serve-time digest integrity (claim-cache stage A — deferred D4, 2026-06-18)

- **What:** Verify a digest's `digest_sha256` before the foreground serves a cached claim; on mismatch, treat as a miss and re-ground rather than serve. Today D10 logs the hash passively and D35 accepts filesystem trust — nothing acts on a mismatch.
- **Why:** Stage A makes the foreground serve cached claims straight to the developer (beat-1). A stale, corrupted, or build-tampered digest then feeds a false fact at full confidence. tesser runs untrusted build code that can write under `~/.tesser/`, so the tamper path is real.
- **Pros:** Closes the corruption + build-tamper vector at the moment it became load-bearing; cheap (one hash compare per serve); degrades gracefully to a normal miss.
- **Cons:** Build-ahead of demand under v1's trusted-dev posture; the logged hash is only as trustworthy as the log; adds a check to the hot serve path.
- **Context:** Decided B (serve unchecked) in the 2026-06-18 /plan-eng-review on `docs/claim-cache-design.md` — maintainer: "tampering is not the main issue nor do we need it now when only trusted devs are using it." Narrows the existing "Digest integrity verification (D10/D35)" TODO to the serve path specifically.
- **Depends on / blocked by:** Trigger — audience widens past trusted devs, or the hosted/sandboxed tier. Do not build for the alpha.

## Cache expiry / claim-validity (claim-cache stage A — the bigger problem, 2026-06-18)

- **What:** A real expiry + validity story for cached claims: when a single claim goes stale vs the whole digest; how expiry interacts with append-only digest growth; eviction/retention (overlaps the existing `~/.tesser/` retention TODO); cross-commit validity (a claim minted at one sha consulted at another).
- **Why:** Stage A serves cached claims. Its only expiry mechanism in v1 is the existing async-drift (serve → background drift-check on the pinned sha → supersede if upstream moved). That catches upstream movement but not claim-level staleness, growth, or eviction. The maintainer flagged this as "bigger cache expiry problems to solve and sort out first" — explicitly NOT for now, but the lurking real problem behind reuse.
- **Pros:** Makes reuse trustworthy over time, not just on a fresh seed; bounds disk; defines claim validity windows rather than trusting forever.
- **Cons:** Genuinely hard (claim-granularity validity is unsolved); build-ahead of demand; entangled with the deferred granular-claim-store question.
- **Context:** Surfaced in the 2026-06-18 /plan-eng-review on `docs/claim-cache-design.md`. v1 ships with async-drift as the only expiry mechanism and that is accepted. Pairs with the granular-claim-store and cross-commit-citations TODOs.
- **Depends on / blocked by:** Not now (maintainer deferred). Natural to take up alongside the granular-claim-store decision once retrieval evals justify finer claims.

## Bare-name alias collision: silent last-writer-wins over-serve (claim-cache, 2026-06-19)

- **What:** The name→identity index (`scripts/fetch` `index_record`, `idx["aliases"][al] = identity` at line ~259) maps each alias to an identity **last-writer-wins, silently**. When two deps share a basename — `github.com/orgA/widget` then `github.com/orgB/widget`, or across hosts `github.com/foo/redis` vs `gitlab.com/bar/redis` — the bare-basename alias (`widget`/`redis`) resolves to whichever was recorded LAST. A later bare-name `fetch consult widget` then serves the WRONG identity's cached digest: a silent cross-identity over-serve. The full URL and the `org/repo` alias still disambiguate correctly; only the bare basename collides.
- **Why:** Beat-1 serves cached claims straight to the developer. A bare-name re-ask ("remind me about widget") that resolves to the wrong same-named dep feeds a confident, wrong answer about a different library. Same-name-different-ecosystem is a named adversarial case (claim-cache design, Codex #9).
- **Pros (of fixing):** Closes a silent wrong-answer path; cheap to detect (an alias already mapped to a different identity ⇒ ambiguous).
- **Cons:** Forcing disambiguation on every bare-name collision adds friction; rare in one dev's cache; the URL and org/repo paths already resolve correctly.
- **Decision (Chris, 2026-06-19):** keep **last-writer-wins for now** for the trusted alpha — do NOT change behavior. Pinned by `tests/cache-applicability.test.ts` (cases B/C) so it can't regress silently and stays visible as accepted behavior.
- **Fix when addressed:** `index_resolve`'s bare-name path returns `ambiguous` (listing candidate identities) when ≥2 identities claim a basename; `consult`/the agent then disambiguates (ask, or use the URL). Needs the index to record ALL identities per alias, not just the last — a small schema change + a contract note.
- **Depends on / blocked by:** Not now (Chris deferred). Revisit when the cache spans many deps or the audience widens past trusted devs.
