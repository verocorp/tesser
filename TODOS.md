# TODOS

Deferred work with context. Items land here only via a review decision; each carries enough context to pick up cold.

## Footnote-style citation shorthand (⟦n⟧ + references block)

- **What:** Allow short inline `⟦1⟧` markers referencing an end-of-digest block (`⟦1⟧ = ⟦path:Lstart-Lend⟧@sha12`), cutting inline citation noise from ~35 chars to 3.
- **Why:** Readability of dense digests (maintainer concern, 2026-06-11 close review, D7 discussion): a digest with a citation per sentence may read noisy; cleaner artifacts share better.
- **Pros:** Noise reduction with zero loss of validation totality — the reserved `⟦` bracket stays the delimiter, so token-totality still holds (plain `[1]` markers can never have this: digests quote code, code is full of brackets). Dedup: one entry, many refs.
- **Cons:** Grammar restructure (schema, validator dangling-ref/orphan checks, serve-path rewrite, Type-A fixtures all move); two citation forms to maintain.
- **Context:** Design sketch settled in the 2026-06-11 review. D37's charset tightening applies under either grammar. Add an agent-join eval case to T7 (can the consuming agent reliably connect ⟦n⟧ to its entry? hunch: yes — prove it).
- **Depends on / blocked by:** **Trigger = the T9 taste gate**: the maintainer reads every corpus digest there; if they read noisy, that is the demand evidence. Do not build before that verdict.

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
