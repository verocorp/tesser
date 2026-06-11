# tesser

You know how your coding agent will confidently explain how some library works — and you can't tell whether it actually knows or it's guessing, so you end up double-checking it yourself? tesser is built for exactly that moment: instead of trusting docs or its own memory, it answers by actually cloning, building, and running the library.

tesser is a Claude Code skill. You ask a question about an unfamiliar dependency; it answers with run-grade evidence.

## What it does

- Clones the repo at a pinned SHA — pinned at first clone and reused from then on. It never silently chases upstream; re-pinning happens only when you ask.
- Surveys the structure, then kicks off a build in the background.
- Answers your actual question first: you get a provisional answer immediately, labeled with its evidence grade, and once build and verify land, a follow-up answer at the upgraded grade supersedes it — a delivered answer is never silently edited. If your session ends mid-build, the next invocation picks up the finished build state and serves the upgraded grade from it. It never blocks your flow.
- Verifies end-to-end, credentials-free: a runnable binary if there is one, else the test suite, else a minimal example.
- Cites every load-bearing claim as `⟦path:Lstart-Lend⟧@sha12` — the first 12 characters of the pinned commit.
- Classifies the dependency kind up front — clonable CLI, clonable library, SDK-of-hosted-service, hosted-closed, heavy-infra — and tells you the evidence-grade ceiling before doing any work. A hosted closed service can only get docs-grade answers, and tesser says so instead of pretending otherwise.

## Install

Clone this repo into your Claude Code skills directory, then run the setup step once:

```
git clone https://github.com/verocorp/tesser ~/.claude/skills/tesser
~/.claude/skills/tesser/scripts/setup
```

Setup creates a private Python environment at `~/.tesser/venv` for tesser's scripts — nothing is installed into your system Python. Re-running it is a no-op until the requirements change. If you skip it, tesser still answers questions; it just can't validate digests, so cold runs won't persist them.

If you'd rather not clone, a zip of this repo unpacked to the same location works identically — the setup step still applies.

## Self-update

At invocation, tesser runs a quiet `git pull --ff-only` in its own skill directory to pick up updates, bounded by a hard 5-second time limit. It is fail-silent: offline, timed out, or diverged means the pull is skipped, and it never blocks an answer. If you installed from a zip there is no git directory and no pull happens. To opt out permanently, delete the `.git` directory.

## Local state and logging

tesser keeps all persisted state under `~/.tesser/`:

- `log.jsonl` — one record per invocation, opened at start and finalized at end: timestamp (`ts`), the resolved repo URL, the pinned SHA, your question, invocation source (`seeded` or `self`), dependency kind, outcome, the failing command and exit code when a step fails, and the path and SHA-256 of any cached digest consulted. A run you abandon mid-build honestly keeps its opened, unfinalized record. The canonical field set and outcome semantics live in `log-schema.yaml` — that file, not this list, is the inventory.
- `venv/` — the private Python environment that `scripts/setup` creates
- a first-run marker
- `clones/` — the repos it has cloned
- `digests/` — the markdown digests it produces

The log is local-only. Nothing ever leaves your machine; there is no call-home. Sharing a log or a digest with anyone is a manual act you perform yourself.

## Untrusted code

tesser clones and builds arbitrary open-source code on your machine — the same thing you'd do by hand. It adds no confirmation layer of its own; it defers entirely to your host agent's (Claude Code's) session permission model and does nothing your agent couldn't already do.

## Bundled digests

`digests/` ships with pre-run digests for a starter set of libraries. When your question hits one, tesser serves it — with full provenance: repo, SHA, environment, every command run with its exit code, the run's timestamp, the dependency kind, and the evidence grade its claims reach — and tells you it did. The canonical provenance inventory is the frontmatter spec in `digest-schema.yaml`.

One honest caveat: tesser trusts digests as ordinary local files. It records each digest's SHA-256 in the log when it persists or serves one, but it does not verify that hash at serve time — anything that can write to `~/.tesser/digests/` can change what a digest says.
