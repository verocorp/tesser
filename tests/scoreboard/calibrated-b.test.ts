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
  parseVerdictLine,
  crossModalSummary,
  type FamilyVerdict,
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
    // confirmed bar (D48, B3i vs B3ii): the distrust warning must be PROACTIVE —
    // volunteered even when the dev never named the lying signal.
    expect(p11!.test.toLowerCase()).toMatch(/proactiv/);
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

  it("the prompt demands a machine-readable VERDICTS line for the cross-modal gate", () => {
    const prompt = buildJudgePrompt("X");
    expect(prompt).toContain("VERDICTS");
    expect(prompt).toMatch(/PASS, PARTIAL, FAIL, or NA/);
  });
});

describe("cross-modal panel — verdict parsing (pure, free)", () => {
  it("pulls the VERDICTS json out of a family answer with table + wrapper noise", () => {
    const raw = [
      "| # | Principle | Verdict | Evidence | Why |",
      "| 1 | answer-first | PASS | 'it does X' | leads |",
      "WEAKEST PRINCIPLE: 9 — machinery silence",
      'VERDICTS {"1":"PASS","2":"PARTIAL","9":"FAIL","11":"NA","weakest":9}',
      "tokens used",
    ].join("\n");
    const v = parseVerdictLine(raw);
    expect(v).not.toBeNull();
    expect(v!.perPrinciple[1]).toBe("PASS");
    expect(v!.perPrinciple[2]).toBe("PARTIAL");
    expect(v!.perPrinciple[9]).toBe("FAIL");
    expect(v!.perPrinciple[11]).toBe("NA");
    expect(v!.weakest).toBe(9);
  });

  it("lowercases/uppercases verdicts and drops unknown values", () => {
    const v = parseVerdictLine('VERDICTS {"1":"pass","2":"bogus","3":"fail"}');
    expect(v!.perPrinciple[1]).toBe("PASS");
    expect(v!.perPrinciple[2]).toBeUndefined();
    expect(v!.perPrinciple[3]).toBe("FAIL");
  });

  it("takes the LAST valid VERDICTS line (final answer beats a streamed partial)", () => {
    const raw = ['VERDICTS {"1":"FAIL"}', "...revised...", 'VERDICTS {"1":"PASS"}'].join("\n");
    expect(parseVerdictLine(raw)!.perPrinciple[1]).toBe("PASS");
  });

  it("returns null when no VERDICTS line is present", () => {
    expect(parseVerdictLine("no machine line here, just prose")).toBeNull();
  });
});

describe("cross-modal panel — agreement gate (pure, free)", () => {
  const fam = (family: string, per: Record<number, string>, parseFailed = false): FamilyVerdict => ({
    family,
    perPrinciple: per as FamilyVerdict["perPrinciple"],
    parseFailed,
  });

  it("passes when both families agree with no FAIL", () => {
    const s = crossModalSummary([
      fam("claude", { 1: "PASS", 2: "PARTIAL" }),
      fam("codex", { 1: "PASS", 2: "PARTIAL" }),
    ]);
    expect(s.panelPass).toBe(true);
    expect(s.disagreements).toEqual([]);
    expect(s.familyPass).toEqual({ claude: true, codex: true });
  });

  it("a FAIL from EITHER family sinks the panel (blind spots can't cancel out)", () => {
    const s = crossModalSummary([
      fam("claude", { 9: "PASS" }),
      fam("codex", { 9: "FAIL" }),
    ]);
    expect(s.familyPass).toEqual({ claude: true, codex: false });
    expect(s.panelPass).toBe(false);
    expect(s.disagreements).toContain(9);
  });

  it("flags disagreement even when both families pass (the decorrelation signal)", () => {
    const s = crossModalSummary([
      fam("claude", { 4: "PASS" }),
      fam("codex", { 4: "PARTIAL" }),
    ]);
    expect(s.panelPass).toBe(true); // neither is a FAIL
    expect(s.disagreements).toEqual([4]);
  });

  it("a family whose verdict didn't parse is unusable and ignored by the gate", () => {
    const s = crossModalSummary([
      fam("claude", { 1: "PASS" }),
      fam("codex", {}, true),
    ]);
    expect(s.unusableFamilies).toEqual(["codex"]);
    expect(s.panelPass).toBe(true); // claude (the only usable family) passes
  });

  it("no usable family → the gate cannot pass", () => {
    const s = crossModalSummary([fam("claude", {}, true), fam("codex", {}, true)]);
    expect(s.panelPass).toBe(false);
    expect(s.unusableFamilies).toEqual(["claude", "codex"]);
  });
});
