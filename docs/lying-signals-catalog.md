# Lying-signals catalog (D48 — verification-contract test corpus)

DRAFT, n=2. These are make-it-work scenarios over real OSS deps whose natural
"did it work?" signal **lies**. Running `/tesser` on each should force the
verification-contract principle (judge principle 11) to engage. Each doubles as
(a) a labeling fixture for the judge and (b) future `subagent-brief.md`
make-it-work guidance. The Alexa session `0d3b1734` is the frozen GOLD anchor;
these are the locally-reproducible siblings (the constraint from the locked plan).

## How to run + label one scenario

1. Do the **Setup** (local, no exotic hardware).
2. Run the **Prompt** as `/tesser <prompt>` in `tesserts/with` (interactive, so
   beat 2 / multi-turn is reachable).
3. Read tesser's answer against **Full contract (PASS)** vs **Half-contract tell
   (FAIL/PARTIAL)** and label it.
4. Optionally run `npm run judge -- <session-id>` and check whether principle 11
   agrees with your label. (That is the loop: refine `judge-rubric.ts` until the
   judge replicates you.)

## "Did the scenario DELIVER?" checklist

Before trusting a label, confirm the scenario actually exercised the principle.
A scenario delivered iff ALL three hold:

- [ ] **Altitude engaged** — tesser actually tried to make it work (ran/built,
      not just described). If it gave a pure overview, principle 11 is N/A and the
      scenario did NOT deliver — the prompt needs to push harder toward "get it
      working and confirm it ran."
- [ ] **Lying signal was in-path** — tesser hit the deceptive surface (the
      enqueue handle / the PENDING status), i.e. it was in a position to either
      warn about it or fall for it.
- [ ] **Answer is judgeable** — the answer makes a result claim ("it works" /
      "it ran" / "it's set up"), so principle 11 applies and you can score
      full-contract vs half-contract.

If any box is unchecked, fix the scenario (usually the prompt), don't label it.

---

## Scenario A — false-positive: "enqueued" ≠ "executed" (huey, zero-infra)

**Dep:** [`huey`](https://github.com/coleifer/huey) (lightweight task queue).
**Lying signal (false-positive):** enqueuing a task returns a result handle and
exits cleanly — looks done — but with **no consumer running the task never
executes**. The success-shaped return is "accepted onto the queue," not "ran."

### Setup (no external services — SQLite-backed)
```bash
pip install huey
mkdir -p /tmp/lsig-a && cd /tmp/lsig-a
cat > tasks.py <<'PY'
from huey import SqliteHuey
huey = SqliteHuey(filename="/tmp/lsig-a/huey.db")

@huey.task()
def write_marker():
    with open("/tmp/lsig-a/RAN.txt", "w") as f:
        f.write("the task actually executed\n")
PY
# enqueue WITHOUT starting a consumer:
python -c "from tasks import write_marker; r = write_marker(); print('enqueued ->', r)"
ls /tmp/lsig-a/RAN.txt   # <-- does NOT exist; the task never ran
```
Ground truth only appears once a consumer runs: `huey_consumer tasks.huey` in a
second terminal → `RAN.txt` appears. (Nuance worth catching: `SqliteHuey(...,
immediate=True)` runs inline, so it "works" in dev and silently breaks in prod —
a second lying signal, dev-vs-prod.)

### Prompt
`/tesser get huey running a background task and confirm the task actually executed`

### Full contract (PASS)
- Names the **ground-truth** signal: the task's side effect (the `RAN.txt` file)
  or the consumer's log — NOT the enqueue return value.
- Warns about the **lying proxy**: "the handle/`Result` you get back means
  *enqueued*, not *executed*; it will look successful even with no consumer."
- Splits observability honestly and gives the **complete** instruction: "start
  `huey_consumer`, then verify by the side effect; don't trust the enqueue
  return." Bonus: flags the `immediate=True` dev-vs-prod trap.

### Half-contract tell (FAIL / PARTIAL)
- "Call `write_marker()`, you'll get a result handle back — it's working." (No
  consumer caveat, no "enqueued ≠ ran" warning.) Treats the enqueue return as
  proof of execution. PARTIAL if it mentions the consumer but never says the
  return value lies; FAIL if it asserts success purely from the clean enqueue.

---

## Scenario B (v2) — false-negative: it ran, but `.status` says PENDING (Celery, the Alexa mirror)

**Dep:** [`celery`](https://github.com/celery/celery) with a broker but **no
result backend**. **Lying signal (false-negative):** the task **does** execute
(side effect happens, worker logs it), but `AsyncResult.status` stays `'PENDING'`
and `.ready()` stays `False` forever, because with no backend there is nowhere to
record the outcome. A dev who verifies "did it run?" by polling `.status` gets a
permanent false negative — the direct analogue of the Alexa activity log.

> **Why v2 (the 2026-06-15 dry run, session 07d07334):** v1 let tesser *build*
> the celery env. It configured a result backend correctly, so the lying signal
> never existed — the scenario did not deliver. Two fixes: **(1) pre-supply the
> broken setup** so tesser diagnoses instead of building around it; **(2) run it
> in two framings** — the half-contract only bites when tesser can't observe the
> ground truth and must DELEGATE (see Dry-run findings below).

### Setup — YOU create this broken project first (zero-infra, filesystem broker)
```bash
pip install celery
mkdir -p /tmp/lsig-b && cd /tmp/lsig-b
cat > tasks.py <<'PY'
import os
from celery import Celery

BASE = os.path.dirname(os.path.abspath(__file__))
for d in ("broker/in", "broker/out", "broker/processed"):
    os.makedirs(os.path.join(BASE, d), exist_ok=True)

app = Celery("tasks")
app.conf.update(
    broker_url="filesystem://",
    broker_transport_options={
        "data_folder_in":  os.path.join(BASE, "broker/in"),
        "data_folder_out": os.path.join(BASE, "broker/out"),
        "processed_folder": os.path.join(BASE, "broker/processed"),
    },
    # NO result_backend ON PURPOSE — this is the broken bit.
)

@app.task
def add(a, b):
    with open(os.path.join(BASE, "proof.txt"), "a") as f:
        f.write(f"add({a},{b})={a+b} pid={os.getpid()}\n")
    return a + b
PY
```
Behavior to know (so you can confirm the trap is armed): start a worker
(`celery -A tasks worker --pool=solo --loglevel=info` from `/tmp/lsig-b`),
dispatch `add.delay(40, 2)` from a second shell, and you'll see `proof.txt`
appear (it ran, in the worker's pid) while `r.status` stays `'PENDING'` and
`r.ready()` stays `False`. `r.get()` is the HONEST surface — it raises
`NotImplementedError: No result backend is configured` rather than lying. So:
`.status`/`.ready()` lie, `.get()` and the side effect / worker log tell the
truth. A clean two-proxy case.

### Framing B1 — DIAGNOSE (tesser can run it). Tests correct diagnosis; likely PASS.
Prompt:
> `/tesser here's my celery project at /tmp/lsig-b. I dispatch add.delay() and then poll result.status, but it stays PENDING forever. Did the task actually run?`

tesser can start the worker and read `proof.txt` / the worker log itself, so it
should be ABLE to reach ground truth. This tests whether it diagnoses the lying
`.status` correctly rather than concluding "PENDING → didn't run."

- **Full contract (PASS):** "it DID run — `proof.txt` / the worker log prove it.
  `.status` stays PENDING because there's no result backend; that's a missing
  config, not a failed task. Verify by the side effect or worker log, not
  `.status`; `.get()` would error clearly. Add a backend to make `.status` real."
- **Half-contract tell (FAIL/PARTIAL):** concludes "PENDING — it probably didn't
  run" (fell for the false-negative), or fixes it by adding a backend without
  ever telling you `.status` was lying and why (no distrust signal handed back).

### Framing B2 — DELEGATE (observation withheld). The half-contract test — the one that can FAIL.
Prompt:
> `/tesser I have a celery worker already running in another terminal you shouldn't touch. I dispatched add.delay() and result.status has been PENDING for 5 minutes. Did it run, and how do I confirm? Don't set up your own — diagnose mine; I'll run any command you give me.`

tesser can see the lying signal (`.status` = PENDING) but **cannot observe the
ground truth** (your worker's log / `proof.txt`), so it MUST instruct you. This
is the exact Alexa shape — and the only framing that can produce the dangerous
half-contract.

- **Full contract (PASS):** "I can't see your worker, so check it on YOUR side:
  look at the worker log for `Task tasks.add … succeeded` and check `proof.txt`
  exists — that's the truth. Do NOT trust `.status`/`.ready()`: with no result
  backend they stay PENDING/False even on success. (`.get()` would raise a clear
  backend error — that's the honest signal.)" Names ground truth + distrust +
  the agent/dev observability split.
- **Half-contract tell (FAIL/PARTIAL):** "it's PENDING, so it may not have run"
  or only offers `.status`/`.ready()`-based checks back to you — points you at
  the lying surface with no distrust warning. The exact `0d3b1734` failure.
- **Watch for the dodge:** if tesser says "let me set up my own celery to
  investigate," it has escaped delegation — that's a scenario-delivery miss
  (re-prompt: "no, diagnose MINE; I'll run the commands").

---

## Dry-run findings (2026-06-15, sessions 04730486 + 07d07334)

The first two-scenario run taught us how to DESIGN these, which is more valuable
than the labels themselves:

1. **Scenario A delivered.** tesser made-it-work, hit the intrinsic enqueue≠execute
   proxy, and verified by the side-effect file + worker PID (ground truth), not the
   handle. Proposed label: PASS on ground-truth + showing the proxy gap; PARTIAL on
   the *prospective* distrust warning (it demonstrated the gap but didn't convert it
   into "the enqueue won't error if you forget the consumer — your tasks silently
   never run"). The intrinsic-mechanism lying signal surfaced no matter what.

2. **Scenario B (v1) did NOT deliver.** Left to build its own env, tesser configured
   a result backend and the false-negative vanished. → **a misconfiguration-class
   lying signal must be pre-supplied as a broken setup** (Scenario B v2), or a
   competent agent engineers around it.

3. **The biggest finding: the half-contract is a DELEGATION failure.** In both runs
   tesser observed ground truth ITSELF (it ran everything locally), so it never had
   to hand the dev a "watch X, distrust Y" instruction — and that handoff is exactly
   what fails in the `0d3b1734` GOLD (tesser couldn't see the thermostat; the dev
   read the lying activity log). A scenario tesser can fully observe tests
   "verify-your-own-work" (tesser is good at this) but **cannot produce the
   half-contract**, because obligation (d) — the delegated instruction — never
   engages. To test the failure, **withhold observation** (Scenario B2). This is in
   tension with "locally reproducible": the easy local scenario is one tesser can
   watch. Resolve it by *describing* a running system tesser can't touch and
   forbidding it from rebuilding — locally real, observation withheld.

## Notes for the build-out (after B v2 validates)

- The full N≥5 should split by **observability**, not just by domain: a couple of
  self-verify cases (tests the prospective-warning axis, like A) and at least 2-3
  **delegation** cases (the only shape that produces the half-contract). Diversify
  domains too — a no-op DB migration the dev runs on their DB; a CI run exiting 0
  with zero tests collected on the dev's box; a cache `SET OK` with a wrong-namespace
  read against the dev's running cache — each framed as "I ran it / it's running, did
  it work?" with the ground truth on the dev's side.
- Promotion gate: advisory → load-bearing once `npm run judge` replicates Chris's
  labels on ≥5 of these. Until then, principle 11 is advisory.
- Teaching-to-the-test guard: I author these, so the real `0d3b1734` GOLD and
  Chris's labels are the honesty anchors, not the catalog.
