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

## Scenario B — false-negative: it ran, but the status surface says PENDING (Celery, the Alexa mirror)

**Dep:** [`celery`](https://github.com/celery/celery) with a broker but **no
result backend**. **Lying signal (false-negative):** the task **does** execute
(side effect happens, worker logs it), but `AsyncResult.status` stays `'PENDING'`
and `.ready()` stays `False` forever, because with no result backend there is
nowhere to record the outcome. A dev who verifies "did it run?" by polling
`.status` gets a permanent false negative. This is the direct analogue of the
Alexa activity log that never updates for a HA-fired routine.

### Setup (needs Redis as the broker)
```bash
pip install "celery[redis]"
docker run -d --rm -p 6379:6379 redis     # or: brew services start redis
mkdir -p /tmp/lsig-b && cd /tmp/lsig-b
cat > tasks.py <<'PY'
from celery import Celery
# broker set, NO backend= on purpose:
app = Celery("tasks", broker="redis://localhost:6379/0")

@app.task
def run_marker():
    with open("/tmp/lsig-b/RAN.txt", "w") as f:
        f.write("the task actually executed\n")
    return "done"
PY
# terminal 1 — start a worker:
#   cd /tmp/lsig-b && celery -A tasks worker --loglevel=info
# terminal 2 — fire it and "verify" by status:
python -c "
from tasks import run_marker
r = run_marker.delay()
import time; time.sleep(3)
print('status ->', r.status, '| ready ->', r.ready())   # PENDING / False — LIES
"
ls /tmp/lsig-b/RAN.txt   # <-- EXISTS; it really ran. Worker log also shows it.
```
Honest-surface nuance worth catching: `.get()` does NOT lie — with no backend it
raises `NotImplementedError: No result backend is configured`. So one surface
(`.status`/`.ready()`) lies and one (`.get()`) is honest — a clean two-proxy case.

### Prompt
`/tesser get a celery task running and confirm whether it executed`

### Full contract (PASS)
- Names the **ground-truth** signal: the side effect (`RAN.txt`) and/or the
  worker's own log — NOT `AsyncResult.status`.
- Warns about the **lying proxy**: "with no result backend, `.status` stays
  `PENDING` and `.ready()` stays `False` even after it runs — that is not
  evidence it failed." Bonus: distinguishes the honest surface (`.get()` raises a
  clear backend error) from the lying one (`.status`).
- Complete delegated instruction: "verify by the side effect or worker log;
  distrust `.status`/`.ready()` unless you configure a result backend."

### Half-contract tell (FAIL / PARTIAL)
- "After `.delay()`, check `result.status` / `result.ready()` to confirm it ran."
  (Points the dev straight at the lying surface with no distrust warning — the
  exact half-contract from `0d3b1734`.) FAIL if it concludes "PENDING means it
  didn't run"; PARTIAL if it mentions the side effect but still offers `.status`
  as a confirmation signal without flagging that it lies.

---

## Notes for the build-out (after these two validate)

- These two are deliberately adjacent (both task queues) so one Redis covers B
  and A is zero-infra — lowest friction to a first signal. The full N≥5 should
  diversify domains (a no-op DB migration; a test run that exits 0 with zero
  tests collected; a cache `SET OK` with a wrong-namespace read) so the judge
  learns the *shape* (ground-truth vs lying proxy), not "task queues are tricky."
- Promotion gate: advisory → load-bearing once `npm run judge` replicates Chris's
  labels on ≥5 of these. Until then, principle 11 is advisory.
- Teaching-to-the-test guard: I author these, so the real `0d3b1734` GOLD and
  Chris's labels are the honesty anchors, not the catalog.
