---
name: tesser-review
description: "Turn structured review data — a comparison, an eval/metrics table, a set of findings a developer should look at rather than read as prose — into a single self-contained HTML view they can open. Use when a table, a side-by-side comparison, or a scannable matrix would land better than a wall of text, especially for tesser's own JIT comparisons of tools, providers, or run results. Not for prose answers (those stay inline) and not for diagrams (use a diagram tool)."
---

# tesser-review

Render a structured review as **one self-contained HTML file** the developer opens. The companion to tesser: tesser grounds and answers; tesser-review is for the moments where the answer is a *comparison or a matrix* that reads better on a page than in chat.

Built from what six real review artifacts actually shared (nothing more): a **single styled document with semantic color-coding**. Everything interactive beyond that was one-off, so it is not assumed here — it graduates per view (see below).

## What you do

1. **Default to a static view.** The most common shape (and the one the JIT comparison needs) is a **color-coded table/matrix + native `<details>` drill-downs, zero JavaScript** — the `example-comparison.html` shape in this skill directory. Mirror it. Reach for JS only when a real interaction is genuinely needed (see *Graduating*).

2. **Build one self-contained file.** Inline this skill's `theme.css` into a `<style>` block (it carries the dark theme + the `s-good`/`s-ok`/`s-warn`/`s-bad`/`s-neutral` status cells + `table.matrix` + `details.drill`). Put the data in styled HTML. Load **nothing** from outside the file — no CDN, no sibling `.svg`/`.js`, no remote image (base64-inline any image). Write it to the session scratch dir, not the repo.

3. **Gate it, then open it.** Run the self-containment check before showing it:

   ```
   python3 <skill-dir>/check.py <review.html>
   ```

   Exit 0 = self-contained, open it (`open <review.html>`). Exit 1 = it pulls an external resource; inline that resource and re-check. There is no "almost self-contained" — a review that phones out is not shipped.

4. **Say one line + open.** "Here's the comparison — opening it." No markup, no path bookkeeping in front of the developer.

## Honest data (the tesser rule, one level over)

Never put a made-up value in a review. A number in a cell reads as measured. If a value is illustrative or estimated, label it (the `note-banner` class) or don't include it. Carry the same grade discipline tesser uses: what was run vs read vs recalled. A pretty table of fabricated facts is the exact failure tesser exists to prevent.

## Graduating (do not pre-build)

The six artifacts split into three families, and only their *color-coding + single-file* is universal. Do NOT ship a general interactive kernel. Add capability only when a real view needs it, then — if that shape recurs — codify it into `theme.css` / a helper:

- **Static viewer** (comparison, metrics report) — CSS + native HTML. Default. No JS.
- **Read-only render** (data-driven from an inline `<script type="application/json">`) — add tabs/filter only if the view is large enough to need them.
- **Capture tool** (localStorage + export + voting) — a human-labeling shape; **rarely what a tesser review needs**. Build only if you're actually collecting the developer's input, never speculatively.

## This skill's files

- `theme.css` — the shared styles (inline into each review).
- `example-comparison.html` — the reference static view; mirror its shape.
- `check.py` — the self-containment gate (stdlib python3; exit 0/1/2).
