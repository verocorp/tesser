# TODOS

Deferred work with context. Items land here only via a review decision; each carries enough context to pick up cold.

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
