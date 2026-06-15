# tesser

You know how your coding agent will confidently explain how some library works, and you can't tell whether it actually knows or it's guessing, so you end up double-checking it yourself? tesser is built for exactly that moment: instead of trusting docs or its own memory, it answers by cloning, building, and running the code.

tesser is a Claude Code skill. You ask a question about an unfamiliar dependency; it answers fast, then grounds that answer in the real source and corrects itself if the source disagrees.

## What it does

tesser is an early alpha.

- **Answers first, in plain language.** You get the answer immediately, with a clear sense of how it knows each part (whether it ran the code, read it, or is going from memory), and never made to sound more certain than it is. No jargon, no waiting.
- **Checks the answer against the real source, in the background.** It works from one specific commit of the code. If reading the source changes the answer, a follow-up corrects it; if the source confirms it, tesser stays quiet. An answer it already gave you is never silently edited.
- **Scales the work to the question.** An overview just reads the source. "How do I set it up" adds a quick build to confirm it installs. "Does it actually work" runs it end-to-end with no credentials needed: a runnable binary if there is one, else the test suite, else a minimal example. Either way it shows you the commands it ran and whether they passed.
- **Pins and reuses.** The first time it clones a library, it locks onto one specific commit and reuses that from then on. It never quietly jumps to a newer version, and only moves forward when you ask. If your session ends mid-build, the next run picks up where it left off.
- **Points to the exact code behind a claim.** Every claim the answer rests on has a file and line number in that commit, but that detail stays out of the chat unless the file and line *is* the answer, so the conversation stays readable.
- **Knows its limits and says so.** When a library caps how far it can go (say, a closed hosted service it can describe but not run), it tells you up front what it can confirm versus only describe, instead of pretending.

## Install

Clone this repo into your Claude Code skills directory, then run the setup step once:

```
git clone https://github.com/verocorp/tesser ~/.claude/skills/tesser
~/.claude/skills/tesser/scripts/setup
```

Setup creates a private Python environment at `~/.tesser/venv` for tesser's scripts. Nothing is installed into your system Python. Re-running it does nothing unless those requirements change. If you skip it, tesser still answers questions; it just can't save what it learns from a run to reuse next time.

If you'd rather not clone, a zip of this repo unpacked to the same location works identically, and the setup step still applies.

## Self-update

On each run, tesser does a quick `git pull --ff-only` in its own skill directory to pick up updates, bounded by a 5-second limit. It fails silently: offline, slow, or diverged just skips it, and it never blocks an answer. To opt out, delete the `.git` directory (a zip install has none, so nothing happens).

## Local state and logging

tesser keeps all its state under `~/.tesser/`:

- `log.jsonl`: one line each time you ask it something. It records the repo and exact commit it looked at, your question, what happened, and the command and exit code if a step failed. If a run stops partway, its line is just left unfinished. The full set of fields is documented in `log-schema.yaml`.
- `venv/`: the private Python environment that `scripts/setup` creates
- `clones/`: the repos it has cloned
- `digests/`: saved results from past runs (see [Digests](#digests) below)

The log is local-only.

## Untrusted code

tesser clones and builds the open-source code you ask about, on your machine. Claude Code's normal permissions apply; tesser adds no confirmation layer of its own.

## Digests

The first time tesser answers a question by going to a library's source, it can save what it found as a **digest**, a markdown file recording where it looked and what it ran: the repo, the exact commit, the environment, and every command with whether it passed. The next time you ask about that library, it reads the saved digest instead of cloning again. The full format is documented in `digest-schema.yaml`.

No digests ship with tesser yet, so your first question about any library always goes to the source. After that, saved digests build up under `~/.tesser/digests/` as you use it.

Note: tesser treats digests as ordinary local files. It records each digest's SHA-256 in the log, but doesn't re-check that hash when it reuses one, so anything that can write to `~/.tesser/digests/` can change what a digest says.
