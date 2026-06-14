# tesser

You know how your coding agent will confidently explain how some library works — and you can't tell whether it actually knows or it's guessing, so you end up double-checking it yourself? tesser is built for exactly that moment: instead of trusting docs or its own memory, it answers by actually cloning, building, and running the library.

tesser is a Claude Code skill. You ask a question about an unfamiliar dependency; it answers fast, then grounds that answer in the real source and corrects itself if the source disagrees.

## What it does

- **Answers first, in plain language.** You get the answer immediately, calibrated by how it actually knows each thing — ran it, read it, or recalling it — never dressed up as more certain than it is. No jargon, no waiting on machinery.
- **Grounds the answer against the real source at a pinned SHA, in the background.** If reading the source changes the answer, a follow-up supersedes it; if it confirms the answer, it stays quiet. A delivered answer is never silently edited.
- **Scales the work to the question.** An overview reads the source. "How do I set it up" adds a quick build to confirm it installs. "Does it actually work" runs it end-to-end, credentials-free — a runnable binary if there is one, else the test suite, else a minimal example — and reports the commands and exit codes.
- **Pins and reuses.** Cloned at a pinned SHA at first clone, reused from then on; it never silently chases upstream, and re-pins only when you ask. If your session ends mid-build, the next invocation picks up the finished build state.
- **Grounds every load-bearing claim to file:line at the pinned commit**, kept in the digest it writes so the conversation stays readable — you see a file:line in the chat only when that location *is* the answer.
- **Knows its ceiling and says so.** It recognizes when a dependency caps how far it can go — a closed hosted service it can only describe, not run — and tells you what it can confirm versus only describe, up front, instead of pretending.

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

## Digests

When tesser grounds a question cold, it can write a digest — a markdown record with full provenance: repo, SHA, environment, every command run with its exit code, the run's timestamp, the dependency kind, and the evidence grade its claims reach. The next time a question hits that library, it grounds against the saved digest instead of cloning again. The canonical provenance inventory is the frontmatter spec in `digest-schema.yaml`.

The skill's bundled `digests/` is empty in this build — no libraries ship pre-seeded yet, so your first question about any library is a cold run. Runtime digests accumulate under `~/.tesser/digests/` as you use it.

One honest caveat: tesser trusts digests as ordinary local files. It records each digest's SHA-256 in the log when it persists or serves one, but it does not verify that hash at serve time — anything that can write to `~/.tesser/digests/` can change what a digest says.
