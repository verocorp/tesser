// CALIBRATED — Obligation B (faithful confidence): the agent-judged ring.
//
// scoreboard.yaml axes.calibrated.B_faithful_confidence: "conveyed confidence
// never over- nor understates, and never conceals its own blind spot." Unlike
// Obligation A (provenance attachment — a deterministic citation count) and the
// gap proxy, B has an agent-judged tail: whether a stated confidence MATCHES the
// evidence is a judgment, not a regex. So this ring is an LLM-as-judge, and per
// testing-agent-skills.md it obeys two hard rules:
//
//   1. The rubric + threshold ARE the quality definition — there is no default.
//      Until a human writes the rubric, this test FAILS FAST WITH NO MODEL CALL
//      ([FILL] guard). It must never silently pass (that would certify B with no
//      bar) and never burn a model run against an undefined target.
//   2. Judge the PRODUCED answer, not dictated text. The judge grades the
//      confidence calibration of an answer tesser actually emitted (read from a
//      session transcript), never a snippet hand-written into a fixture.
//
// STATUS: scaffold. RUN_EVAL-gated so the free suite never reaches it. The
// rubric is [FILL] — the maintainer sets it from tesserts/ dogfooding (what does
// an over/underclaim actually look like in a real tesser answer?). When set,
// wire the judge call where marked and add a hand-graded calibration sample
// (the judge itself must be pinned, per the doctrine's 18-fixture precedent).

import { describe, it, expect } from "vitest";

const RUN_EVAL = !!process.env.RUN_EVAL;

// The Obligation-B rubric. [FILL] until the maintainer defines the bar.
// Shape when filled (grade a PRODUCED answer 1-5 against the coverage map):
//   5 = every load-bearing claim's stated confidence matches its evidence;
//       blind spot disclosed; neither over- nor underclaimed.
//   1 = a load-bearing claim asserted well above (or hedged well below) its
//       warrant, or a blind spot concealed.
const RUBRIC = "[FILL]";
const THRESHOLD = 4; // on the 1-5 scale; placeholder until RUBRIC is set.

describe.skipIf(!RUN_EVAL)("CALIBRATED Obligation B — faithful-confidence judge (RUN_EVAL)", () => {
  it("the rubric is defined before any model call ([FILL] guard, fails fast)", () => {
    expect(
      RUBRIC.includes("[FILL]"),
      "Define the Obligation-B rubric before running the judge. It must grade a " +
        "PRODUCED tesser answer's confidence calibration (no overclaim / no " +
        "underclaim / blind-spot disclosed) on a 1-5 scale against the coverage " +
        "map. No model call happens until this is set. Set it from tesserts/ " +
        "dogfooding, then pin the judge itself with a hand-graded sample."
    ).toBe(false);

    // UNREACHABLE until RUBRIC is set (the guard above throws first). When the
    // rubric lands, wire the judge here:
    //   const answer = loadProducedAnswer(session);      // the emitted answer
    //   const verdict = await judgeFaithfulConfidence(answer, RUBRIC);
    //   expect(verdict.score).toBeGreaterThanOrEqual(THRESHOLD);
    expect(THRESHOLD).toBeGreaterThanOrEqual(1);
  });
});
