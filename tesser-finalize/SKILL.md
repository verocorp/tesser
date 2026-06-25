---
name: tesser-finalize
description: "Persist what a tesser run learned by operating a credentialed or hosted closed service — the deliberate, developer-invoked save for a run that the background grounding never auto-persists. Use after operating a live service (a cloud platform, a billing API) with the developer's own scoped credentials, or any run-grade investigation the main thread did itself, when the developer wants to keep the result so the next ask serves from cache."
---

# tesser-finalize

The deliberate save (contract:provider-grounded, D53). A normal tesser overview or build auto-persists its map from the background subagent. A **credentialed or hosted-service** run does not: the developer operated a live service with you in the main thread, and that path has no automatic entry into the cache. This skill is that entry — explicit, developer-invoked, never automatic.

Use it when a run produced something worth keeping that wasn't saved: facts learned by operating a hosted closed service (a cloud platform, a billing API) with the developer's own scoped credentials, or any run-grade result the main thread reached itself.

## What you do

1. **Assemble the map** — a single markdown file, YAML frontmatter + a body of the cited claims. Pick the anchor by what was verified:

   - **Hosted closed service (no clonable repo)** → **provider-anchored**. Frontmatter: `provider: <vendor>/<service>` (e.g. `clickhouse/cloud`), `observed_at` (ISO-8601 UTC of when you ran it), `env`, `commands` + exit codes, `ts`, `dependency_kind: hosted-closed`, `truth_grade`, and — required — `scope: personal` + `reproducible: false`. Facts you established by operating the service carry the `⟦observed⟧` marker (not source-grounded, not recall). A `run`-grade provider map must carry at least one `⟦observed⟧` claim.
   - **A repo you cloned** → **repo-anchored**, the normal map (`repo`, `sha`, citations to `⟦path:Lstart-Lend⟧@sha12`).

   Spec for both: `digest-schema.yaml`. Stage it anywhere — `scripts/finalize` computes the correct location; never hand-build a `digests/` path.

2. **Persist + log in one call:**

   ```
   scripts/finalize --digest <staged.md> --question "<the dev's question>" \
     --dependency-kind <kind> \
     ( --provider <vendor>/<service> [--credentialed] | --repo <url> --sha <40hex> [--clone <dir>] )
   ```

   It validates and persists the map to `~/.tesser/digests/` (a provider map lands under `provider/<vendor>/<service>@<YYYYMMDD>.md`, personal-scope, never bundled), opens a log record, and finalizes it with the persisted map's hash. Exit 0 = saved; 1 = the map was invalid (fix it); 3 = run `scripts/setup` first; 4 = environment, keep the file and retry.

3. **Confirm in one plain line** — "saved; next time I can answer this from cache." Then stop. No markup, no path, no hash in front of the developer.

## The credentialed posture (contract:provider-grounded, D49)

You only operate a credentialed service on the developer's explicit opt-in, with **their own scoped, throwaway** credentials — never their primary keys, and tesser builds no credential machinery. What you persist is **observed** knowledge: true of that account at that moment, not reproducible by the next developer. The map says so (`reproducible: false`); your words to the developer say so too. Never present an observed fact as documented behavior.
