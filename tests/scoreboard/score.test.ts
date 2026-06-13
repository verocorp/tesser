// tesser scoreboard scorer (T7) — tests.
//
// Rings (testing-agent-skills pyramid — these are Type-C: the scorer is a
// deterministic binary, tested like normal software, no model runs):
//   1. SYNTHETIC units (always run under `npm test`) — lock each axis primitive
//      against a hand-built transcript, independent of any machine's history.
//   2. HEURISTIC certification (recall + bias, from real sessions) — answer_leads
//      and gaps are regex APPROXIMATIONS of a judgment; this block pins their
//      behavior on real should-flag (recall) and should-stay-quiet (bias) text
//      drawn from the on-disk sessions. ADVISORY, not gating (below).
//   3. GOLD reproduction (skipped when the real sessions are absent) — the
//      durable scorer reproduces the published numbers; that match certifies
//      the port. Where it diverges from the throwaway probe, the durable
//      definition WINS and is documented (the lexicon count — see the gold block).
//
// WHAT THIS SUITE DOES NOT PROVE (principle 8 — the ownership map):
//   - NOT that SKILL.md is good. It pins the scorer's MATH, not the playbook.
//   - NOT that tesser beats the default in production. That needs a live A/B
//     run + judgment; this suite never runs a model.
//   - NOT that the forbidden_lexicon / bars are the RIGHT thresholds. Those are
//     taste/contract calls (D41 etc.), certified by the maintainer, not here.
//   - NOT the heuristic ACCURACY. answer_leads/gaps are calibrated against the
//     maintainer's tesserts/ dogfooding, not pre-labeled fixtures — so their
//     outputs are ADVISORY (the win-condition warns, never red-bars, on them)
//     until that calibration lands. CALIBRATED Obligation B is owned by
//     calibrated-b.test.ts (RUN_EVAL, [FILL]-guarded).

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { parseSession, questionTurnIndex } from "./parse.ts";
import {
  scoreSession,
  scoreFaster,
  scoreDigestible,
  scoreCalibrated,
  scorePair,
  loadScoreboard,
  looksLikeNarration,
  countGapMarkers,
  type Role,
  type SessionScore,
} from "./score.ts";

// --- synthetic transcript builder ------------------------------------------

type Ev = { role: "user" | "assistant"; text: string; t: number }; // t = seconds from base
const BASE = Date.parse("2026-06-12T00:00:00.000Z");

function synth(events: Ev[]): string {
  const dir = mkdtempSync(join(tmpdir(), "tesser-score-"));
  const lines = events.map((e) => {
    const timestamp = new Date(BASE + e.t * 1000).toISOString();
    const content =
      e.role === "user"
        ? e.text
        : [{ type: "text", text: e.text }];
    return JSON.stringify({
      type: e.role,
      sessionId: "synthetic",
      timestamp,
      message: { role: e.role, content },
    });
  });
  const p = join(dir, "session.jsonl");
  writeFileSync(p, lines.join("\n") + "\n");
  return p;
}

const spec = loadScoreboard();
const ans = (n: number) => "A".repeat(n); // a substantive answer body of n chars

describe("parse + question-turn selection", () => {
  it("skips a bare greeting to find the real question turn", () => {
    const p = synth([
      { role: "user", text: "hi", t: 0 },
      { role: "assistant", text: "Hi Chris!", t: 3 },
      { role: "user", text: "what does this library do and how do I set it up?", t: 8 },
      { role: "assistant", text: ans(300), t: 20 },
    ]);
    const view = parseSession(p);
    expect(view.userTurns).toHaveLength(2);
    expect(questionTurnIndex(view)).toBe(1);
  });

  it("keeps turn 0 when it is already the question", () => {
    const p = synth([
      { role: "user", text: "explain the build system in this repo please", t: 0 },
      { role: "assistant", text: ans(300), t: 10 },
    ]);
    expect(questionTurnIndex(parseSession(p))).toBe(0);
  });

  it("excludes empty assistant text blocks (tool-only turns)", () => {
    const p = synth([
      { role: "user", text: "question here that is long enough", t: 0 },
      { role: "assistant", text: "   ", t: 5 },
      { role: "assistant", text: ans(300), t: 12 },
    ]);
    expect(parseSession(p).assistantBlocks).toHaveLength(1);
  });
});

describe("FASTER", () => {
  it("default: first >=250-char block after the question stops the clock", () => {
    const p = synth([
      { role: "user", text: "what is the max depth and where is it set?", t: 0 },
      { role: "assistant", text: "one sec", t: 4 }, // <250, does not count
      { role: "assistant", text: ans(300), t: 12 },
    ]);
    const f = scoreFaster(parseSession(p), "default", spec);
    expect(f.ttfaSeconds).toBe(12);
    expect(f.method).toBe("250char");
    expect(f.passesHardGate).toBe(true);
    expect(f.meetsIdeal).toBe(false); // 12 > 10
    expect(f.note).toBeUndefined();
  });

  it("tesser without a marker: warns the 250-char fallback may misfire", () => {
    const p = synth([
      { role: "user", text: "what does this do and how do I set it up?", t: 0 },
      { role: "assistant", text: ans(300), t: 8 },
    ]);
    const f = scoreFaster(parseSession(p), "tesser", spec);
    expect(f.method).toBe("250char");
    expect(f.note).toMatch(/MISFIRES/);
  });

  it("tesser with a configured marker: clock stops at the marker block", () => {
    const markerSpec = {
      ...spec,
      marker: /tell me your follow-ups/i,
    };
    const p = synth([
      { role: "user", text: "what does this library do, briefly?", t: 0 },
      { role: "assistant", text: ans(300), t: 5 }, // long, but NOT the marker
      { role: "assistant", text: "Max depth is 8. I'm pulling more — tell me your follow-ups.", t: 9 },
    ]);
    const f = scoreFaster(parseSession(p), "tesser", markerSpec);
    expect(f.method).toBe("marker");
    expect(f.ttfaSeconds).toBe(9);
    expect(f.note).toBeUndefined();
  });

  it("flags a run that blows the ≤30s hard gate", () => {
    const p = synth([
      { role: "user", text: "what does this library actually do here?", t: 0 },
      { role: "assistant", text: ans(300), t: 45 },
    ]);
    expect(scoreFaster(parseSession(p), "default", spec).passesHardGate).toBe(false);
  });
});

describe("DIGESTIBLE", () => {
  it("counts lexicon-leak occurrences (hard-0 gate) over the full output", () => {
    const leaky =
      "This is a cold run; the digest is provisional. run-grade vs run-grade later.";
    const p = synth([
      { role: "user", text: "what does this library do and how to use it?", t: 0 },
      { role: "assistant", text: leaky + " " + ans(300), t: 8 },
    ]);
    const view = parseSession(p);
    const f = scoreFaster(view, "tesser", spec);
    const d = scoreDigestible(view, spec, f);
    // cold run ×1, digest ×1, provisional ×1, run-grade ×2 = 5 occurrences.
    expect(d.lexiconLeakTotal).toBe(5);
    expect(d.lexiconLeakTerms["run-grade"]).toBe(2);
  });

  it("flags raw citation markup in the first answer (above-the-fold)", () => {
    const p = synth([
      { role: "user", text: "where is max depth defined in this code?", t: 0 },
      { role: "assistant", text: "Max depth is 8 ⟦src/lib.py:L1-L1⟧@abc123abc123. " + ans(300), t: 8 },
    ]);
    const view = parseSession(p);
    const f = scoreFaster(view, "default", spec);
    const d = scoreDigestible(view, spec, f);
    expect(d.citationMarkupFirstAnswer).toBe(1);
    expect(d.citationMarkupTotal).toBe(1);
  });

  it("answer_leads is false when the lead names the tool/process", () => {
    const p = synth([
      { role: "user", text: "what does this library do and how do I set it up?", t: 0 },
      { role: "assistant", text: "This looks like a job for the tesser skill — let me work through it.", t: 5 },
      { role: "assistant", text: ans(300), t: 20 },
    ]);
    const view = parseSession(p);
    const f = scoreFaster(view, "tesser", spec);
    const d = scoreDigestible(view, spec, f);
    expect(d.answerLeads).toBe(false);
    expect(d.answerLeadsNote).toMatch(/process narration/);
  });

  it("answer_leads is true when a real answer leads (greeting ignored)", () => {
    const p = synth([
      { role: "user", text: "what is the default max search depth here?", t: 0 },
      { role: "assistant", text: "Hi!", t: 3 }, // pure greeting, skipped
      { role: "assistant", text: "The default maximum search depth is 8. " + ans(280), t: 9 },
    ]);
    const view = parseSession(p);
    const f = scoreFaster(view, "default", spec);
    expect(scoreDigestible(view, spec, f).answerLeads).toBe(true);
  });
});

describe("CALIBRATED", () => {
  it("Obligation A = count of checkable provenance pointers", () => {
    const p = synth([
      { role: "user", text: "where are the two key constants set in this repo?", t: 0 },
      {
        role: "assistant",
        text: "MAX is at ⟦a.py:L1-L1⟧@abc123abc123 and MIN at ⟦b.py:L2-L2⟧@abc123abc123.",
        t: 8,
      },
    ]);
    expect(scoreCalibrated(parseSession(p)).provenanceCount).toBe(2);
  });

  it("gap-surfacing proxy catches 'did not build/run' and missing-credential language", () => {
    const p = synth([
      { role: "user", text: "does the LLM path work end to end in this repo?", t: 0 },
      {
        role: "assistant",
        text: "I read the code but did not build or run it; the loop needs a Gemini key I could not reach.",
        t: 8,
      },
    ]);
    expect(scoreCalibrated(parseSession(p)).gapsSurfaced).toBeGreaterThanOrEqual(2);
  });

  it("Obligation B is reported as not-scored, never silently zero", () => {
    const c = scoreCalibrated(parseSession(synth([
      { role: "user", text: "anything at all about this library?", t: 0 },
      { role: "assistant", text: ans(300), t: 8 },
    ])));
    expect(c.bScored).toBe(false);
    expect(c.bNote).toMatch(/agent-judged/);
  });
});

// --- HEURISTIC certification (recall + bias, from real on-disk sessions) ----
//
// answer_leads (looksLikeNarration) and gaps (countGapMarkers) are regex
// APPROXIMATIONS of a judgment. Recall = real text that SHOULD flag; bias =
// real text that should STAY QUIET. Fixtures are drawn byte-faithfully from the
// actual sessions (pyyaml/codeharness tesser leads; pyyaml/kinesis/coral default
// openers) so the heuristic is pinned against reality, not paraphrase. These
// pin the heuristic's OUTPUT, not its accuracy — accuracy is calibrated by the
// maintainer's tesserts/ dogfooding (the win-condition treats them as advisory).

// Narration leads that SHOULD flag (real tesser openings).
const NARRATION_RECALL = [
  ["pyyaml: 'job for the tesser skill'", "This looks like a job for the `tesser` skill — you're asking about an unfamiliar dependency (PyYAML) and want run-grade answers on what it does."],
  ["pyyaml: 'work through the tesser protocol'", "I'll work through the tesser protocol: self-update, open the log, check for an existing digest, then clone/build/verify PyYAML."],
  ["pyyaml: 'Self-update done'", "Self-update done. Now let me open the invocation log and resolve PyYAML to its canonical repo."],
  ["pyyaml: 'Cold run — Preflight/classification'", "Cold run — no digest, no clone. \n\n**Preflight / classification:** PyYAML is a `clonable-library`."],
  ["pyyaml: 'Pinned at <sha>'", "Pinned at `d51d8a138f72`. Let me survey the structure to ground a provisional answer."],
  ["codeharness: 'what the tesser skill is built for'", "This is exactly what the `tesser` skill is built for — answering what a dependency does and how it works."],
  ["codeharness: 'follow the tesser protocol'", "I'll follow the tesser protocol. Let me start: self-update, open the invocation log, and check for an existing digest."],
  ["codeharness: 'No digest — cold path — Log ID'", "No digest, no clone — cold path. Log ID is `6829f63b`. Let me clone and pin it."],
  ["codeharness: 'Cloned and pinned at <sha>'", "Cloned and pinned at `9af90f68bf74`. Let me survey the structure to ground a provisional answer."],
] as const;

// Real default-agent openers that LEAD with the answer — must NOT flag.
const NARRATION_BIAS = [
  ["pyyaml default opener", "You're asking about **PyYAML**, the standard Python library for working with YAML in Python."],
  ["kinesis default opener", "Got it — AWS Kinesis. Here's the practical rundown. Kinesis is AWS's family of services for real-time streaming data."],
  ["coral default opener", "Here's the rundown on **Coral** (`withcoral/coral`). Coral is a local SQL runtime that gives AI agents unified query access."],
  ["collision: 'pin a version' (advice, not 'pinned at')", "To pin a version, add `PyYAML==6.0` to your requirements.txt."],
  ["collision: 'run as a CLI' (not process narration)", "The library can run as a CLI or be imported as a module."],
  ["collision: 'logs to stdout' (not 'log opened/id')", "It logs to stdout by default; configure a handler to change that."],
] as const;

// Gap-surfacing language that SHOULD count (real + real-pattern).
const GAP_RECALL = [
  ["pyyaml real: 'did not build or run them'", "These ship with libyaml support per the README, but I did not build or run them."],
  ["pattern: stale-from-training, unverified", "I'm recalling this from training, so it may be stale; I didn't verify it against the source."],
  ["pattern: couldn't run, needs a key", "I couldn't run the LLM loop — it needs a Gemini key I don't have."],
] as const;

// Confident text that must NOT count as a tesser gap.
const GAP_BIAS = [
  ["plain confident answer", "PyYAML parses and emits YAML; use `yaml.safe_load` to read a document."],
  ["codeharness real: dep's OWN use of Postgres/Gemini (not a tesser limit)", "memory.py is a Postgres + pgvector store of past tasks and embeddings; it uses Gemini or Ollama embeddings."],
  ["collision: 'Run pip install' (not 'couldn't run')", "Run `pip install pyyaml` to set it up."],
  ["collision: 'API key in config' (not 'needs a key')", "The API key goes in the config file under `auth`."],
] as const;

describe("heuristic certification: answer_leads (looksLikeNarration)", () => {
  it.each(NARRATION_RECALL.map(([l, t]) => [l, t]))(
    "RECALL flags narration — %s",
    (_label, text) => {
      expect(looksLikeNarration(text)).toBe(true);
    }
  );
  it.each(NARRATION_BIAS.map(([l, t]) => [l, t]))(
    "BIAS stays quiet on a real answer — %s",
    (_label, text) => {
      expect(looksLikeNarration(text)).toBe(false);
    }
  );
});

describe("heuristic certification: gaps (countGapMarkers)", () => {
  it.each(GAP_RECALL.map(([l, t]) => [l, t]))(
    "RECALL counts a surfaced gap — %s",
    (_label, text) => {
      expect(countGapMarkers(text)).toBeGreaterThanOrEqual(1);
    }
  );
  it.each(GAP_BIAS.map(([l, t]) => [l, t]))(
    "BIAS counts zero on confident text — %s",
    (_label, text) => {
      expect(countGapMarkers(text)).toBe(0);
    }
  );
});

describe("win condition (pair)", () => {
  function mk(role: Role, evs: Ev[], qTurn?: number): SessionScore {
    return scoreSession(synth(evs), role, { questionTurn: qTurn, spec });
  }

  it("tesser WINS when better on one axis, not worse on the others, hard gate met", () => {
    // Same fast answer-first shape, but tesser attaches provenance the default lacks.
    const q = "where is the default max depth defined in this repo?";
    const tesser = mk("default" /* answer-first shape, no narration */, [
      { role: "user", text: q, t: 0 },
      { role: "assistant", text: "Max depth is 8, defined in src/lib.py line 1. " + ans(300), t: 8 },
    ]);
    const def = mk("default", [
      { role: "user", text: q, t: 0 },
      { role: "assistant", text: "Max depth is 8, defined in src/lib.py line 1. " + ans(300), t: 8 },
    ]);
    // Hand-bump tesser provenance so it strictly leads calibrated, ties elsewhere.
    tesser.calibrated.provenanceCount = 1;
    const v = scorePair(tesser, def);
    expect(v.calibrated).toBe("tesser-better");
    expect(v.faster).toBe("tie");
    expect(v.digestible).toBe("tie");
    expect(v.win).toBe(true);
  });

  it("tesser does NOT win when it loses an axis, even if it leads another", () => {
    const q = "what does this library do and how do I set it up?";
    const tesser = mk("tesser", [
      { role: "user", text: q, t: 0 },
      { role: "assistant", text: "This looks like a job for the tesser skill.", t: 5 },
      { role: "assistant", text: "It is a cold run; here is the provisional digest. " + ans(900), t: 70 },
    ]);
    const def = mk("default", [
      { role: "user", text: q, t: 0 },
      { role: "assistant", text: "It parses YAML. " + ans(300), t: 18 },
    ]);
    const v = scorePair(tesser, def);
    expect(v.faster).toBe("tesser-worse");
    expect(v.win).toBe(false);
  });
});

// --- GOLD reproduction (the port's correctness certificate) ----------------
//
// These run only on a machine that holds the real A/B sessions (the
// maintainer's). They assert the durable scorer reproduces the published
// numbers — the TTFA/length/provenance that the throwaway /tmp probe produced.

const WITHOUT = join(
  homedir(),
  ".claude/projects/-Users-chris-workspace-tesserts-without",
);
const WITH = join(
  homedir(),
  ".claude/projects/-Users-chris-workspace-tesserts-with",
);
const pyyamlDefault = join(WITHOUT, "617bdfbb-c4df-4068-811d-543854db6ab0.jsonl");
const pyyamlTesser = join(WITH, "db8e01b9-4321-4e13-8d03-707cc6af152e.jsonl");
const haveGold = existsSync(pyyamlDefault) && existsSync(pyyamlTesser);

describe.skipIf(!haveGold)("GOLD: reproduce scoreboard-results.md (real sessions)", () => {
  it("pyyaml default: TTFA 19.6s, 3248-char answer, 0 leak, 0 provenance", () => {
    const s = scoreSession(pyyamlDefault, "default");
    expect(s.questionTurnIndex).toBe(1); // after the "hi" turn
    expect(s.faster.ttfaSeconds).toBeCloseTo(19.6, 1);
    expect(s.faster.firstAnswerChars).toBe(3248);
    expect(s.digestible.lexiconLeakTotal).toBe(0);
    expect(s.digestible.answerLeads).toBe(true);
    expect(s.calibrated.provenanceCount).toBe(0);
  });

  it("pyyaml tesser: 14 provenance pointers, leads with narration, ≥1 gap", () => {
    const s = scoreSession(pyyamlTesser, "tesser");
    expect(s.calibrated.provenanceCount).toBe(14); // matches scoreboard-results
    expect(s.digestible.answerLeads).toBe(false); // narration lead
    expect(s.calibrated.gapsSurfaced).toBeGreaterThanOrEqual(1);
    expect(s.faster.note).toMatch(/MISFIRES/); // no marker yet → flagged fallback
    // CANONICAL DIVERGENCE: the durable lexicon count is 27 occurrences over the
    // full human-facing output under the FINAL lexicon (D41 added inspect-grade
    // ×1 + docs-grade ×2 to the pre-D41 seed's 24); scoreboard-results.md
    // published 18 from the (now-lost) throwaway probe. The durable definition
    // supersedes it; the hard-0 gate fires identically either way (any leak).
    expect(s.digestible.lexiconLeakTotal).toBe(27);
  });

  it("pyyaml: tesser does NOT win the cell (loses FASTER + DIGESTIBLE)", () => {
    const v = scorePair(
      scoreSession(pyyamlTesser, "tesser"),
      scoreSession(pyyamlDefault, "default"),
    );
    expect(v.calibrated).toBe("tesser-better"); // provenance 14 vs 0
    expect(v.win).toBe(false);
  });
});
