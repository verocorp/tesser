# tesser

You know how your coding agent will confidently explain how some library works — and you can't tell whether it actually knows or it's guessing, so you end up double-checking it yourself? tesser is built for exactly that moment: instead of trusting docs or its own memory, it answers by actually cloning, building, and running the library.

tesser is a Claude Code skill. You ask a question about an unfamiliar dependency; it answers with run-grade evidence.

## What it does

- Clones the repo at a pinned SHA.
- Surveys the structure, then kicks off a build in the background.
- Answers your actual question first: you get a provisional answer immediately, labeled with its evidence grade, and it's upgraded in place once build and verify land. It never blocks your flow.
- Verifies end-to-end, credentials-free: a runnable binary if there is one, else the test suite, else a minimal example.
- Cites every load-bearing claim as `⟦path:Lstart-Lend⟧@SHA`.
- Classifies the dependency kind up front — clonable CLI, clonable library, SDK-of-hosted-service, hosted-closed, heavy-infra — and tells you the evidence-grade ceiling before doing any work. A hosted closed service can only get docs-grade answers, and tesser says so instead of pretending otherwise.

## Install

Clone this repo into your Claude Code skills directory:

```
git clone https://github.com/verocorp/tesser ~/.claude/skills/tesser
```

If you'd rather not clone, a zip of this repo unpacked to the same location works identically.

## Self-update

At invocation, tesser runs a quiet `git pull --ff-only` in its own skill directory to pick up updates. It is fail-silent: offline or diverged means the pull is skipped, and it never blocks an answer. If you installed from a zip there is no git directory and no pull happens. To opt out permanently, delete the `.git` directory.

## Local state and logging

tesser keeps all persisted state under `~/.tesser/`:

- `log.jsonl` — one record per invocation: timestamp, repo, SHA, question, outcome, and whether a cached digest was consulted.
- a first-run marker
- `clones/` — the repos it has cloned
- `digests/` — the markdown digests it produces

The log is local-only. Nothing ever leaves your machine; there is no call-home. Sharing a log or a digest with anyone is a manual act you perform yourself.

## Untrusted code

tesser clones and builds arbitrary open-source code on your machine — the same thing you'd do by hand. It adds no confirmation layer of its own; it defers entirely to your host agent's (Claude Code's) session permission model and does nothing your agent couldn't already do.

## Bundled digests

`digests/` ships with pre-run digests for a starter set of libraries. When your question hits one, tesser serves it — with full provenance: repo, SHA, environment, commands and exit codes — and tells you it did.
