// CALIBRATED — Obligation B (faithful confidence): the agent-judged ring.
//
// The rubric is no longer [FILL] — it's defined in judge-rubric.ts from Chris's
// dogfood principles (2026-06-13). Two layers, per testing-agent-skills:
//
//   - FREE (this file, runs in `npm test`): Type-A checks that the rubric is
//     well-formed and the prompt actually carries the principles + the
//     KNOWN_FAILURE_MODES self-corrections. No model call.
//   - LIVE (on demand, NOT here): `npm run judge -- <session-id>` spawns
//     `claude -p` to grade a PRODUCED answer, with the deterministic gates
//     printed alongside as the non-foolable floor. A model call, so it never
//     runs in the free suite.
//
// The judge grades the artifact, not dictated text; the KNOWN_FAILURE_MODES block
// is the "never trust yourself in THESE ways" correction (targeted + structural,
// never global — a judge that distrusts everything is trustworthy-but-useless).

import { describe, it, expect } from "vitest";
import {
  PRINCIPLES,
  KNOWN_FAILURE_MODES,
  buildJudgePrompt,
} from "./judge-rubric.ts";

describe("CALIBRATED Obligation B — rubric is well-formed (free)", () => {
  it("defines the dogfood principles, numbered 1..11", () => {
    expect(PRINCIPLES).toHaveLength(11);
    expect(PRINCIPLES.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    for (const p of PRINCIPLES) {
      expect(p.name.length, `principle ${p.n} needs a name`).toBeGreaterThan(0);
      expect(p.test.length, `principle ${p.n} needs a test`).toBeGreaterThan(20);
    }
  });

  // D48 (2026-06-15) regression anchor — the verification-contract principle and
  // its half-contract failure mode must not silently regress out. The semantic
  // GOLD must-flag (judge principle 11 fires on session 0d3b1734's half-contract:
  // "watch the setpoint" given, "ignore the activity log" omitted) is a LIVE check
  // (`npm run judge -- 0d3b1734`), credit-walled like the b40f75e1 re-dogfood; this
  // free test pins that the rubric is EQUIPPED to catch it. ADVISORY until the
  // lying-signals catalog calibrates it on >=5 Chris-labeled make-it-work sessions.
  it("carries the verification-contract principle + the half-contract failure mode (D48)", () => {
    const p11 = PRINCIPLES.find((p) => p.n === 11);
    expect(p11?.name).toBe("verification-contract");
    // conditional: it must scope itself to does-it-work, not penalize overviews
    expect(p11!.test.toLowerCase()).toMatch(/does-it-work|make-it-work/);
    expect(p11!.test.toLowerCase()).toMatch(/half-contract/);
    const modes = KNOWN_FAILURE_MODES.map((f) => f.mode.toLowerCase()).join(" ");
    expect(modes).toMatch(/half-contract/);
  });

  it("carries no [FILL] sentinel (the bar is set)", () => {
    const blob = JSON.stringify(PRINCIPLES) + JSON.stringify(KNOWN_FAILURE_MODES);
    expect(blob.includes("[FILL]")).toBe(false);
  });

  it("enumerates the judge's known failure modes, each with a correction", () => {
    expect(KNOWN_FAILURE_MODES.length).toBeGreaterThanOrEqual(4);
    for (const f of KNOWN_FAILURE_MODES) {
      expect(f.mode.length).toBeGreaterThan(10);
      expect(f.correction.length).toBeGreaterThan(10);
    }
    const modes = KNOWN_FAILURE_MODES.map((f) => f.mode.toLowerCase()).join(" ");
    expect(modes).toMatch(/lenien|sycophan/); // the one we already observed on gds
  });

  it("the built prompt grades the PRODUCED answer and includes the failure-mode block", () => {
    const prompt = buildJudgePrompt("SOME PRODUCED ANSWER TEXT");
    expect(prompt).toContain("SOME PRODUCED ANSWER TEXT");
    expect(prompt).toContain("KNOWN_FAILURE_MODES");
    expect(prompt).toContain("ANSWER UNDER JUDGMENT");
    // evidence-required: the prompt must demand a quote per verdict
    expect(prompt.toLowerCase()).toMatch(/quote|evidence/);
    // targeted, not global: the prompt must forbid distrusting everything
    expect(prompt.toLowerCase()).toMatch(/not generalize|distrusting everything|useless/);
    for (const p of PRINCIPLES) expect(prompt.toUpperCase()).toContain(p.name.toUpperCase());
  });
});
