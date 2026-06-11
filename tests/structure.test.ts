// T5 Type-B deterministic gates (tests/structure.test.ts — the file name
// promised by contract.yaml's header comment) + spec-integrity gates.
//
// Spec-as-data: clause ids, the anchor format, the byte budget, enums, and
// the citation token_pattern are all loaded from contract.yaml /
// digest-schema.yaml / log-schema.yaml parsed as data — never hardcoded
// copies. The one deliberate exception is the canonical outcome list and the
// cross-schema dependency_kind comparison, which exist precisely to catch
// drift in the schemas themselves.
//
// ============================================================================
// SELF-ARMING STUB GATES — the stub is gone; the guard remains
// ============================================================================
// SKILL.md WAS a deliberate STUB until T4 landed (its frontmatter description
// began with "STUB"). T4 (commit e9c48d4) replaced it with the real playbook,
// so SKILL_IS_STUB is now false and these five Type-B gates are armed and
// asserting real content (clause anchors, logger call sites, the verify-
// fallback ladder, self-update wording). The skipIf machinery is KEPT, not
// removed: it is the regression guard against re-stubbing — if a future edit
// ever marks the description STUB again, the stub-marker consistency meta-gate
// (section C) fails loudly rather than letting the content gates silently skip.
//
// The byte-budget gate (gate 4) runs unconditionally — it is about the playbook
// not blowing the budget pinned in contract.yaml.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// ---- specs parsed as data ---------------------------------------------------

interface Clause {
  id: string;
  delta: boolean;
  source: string[];
  statement: string;
}
interface Contract {
  version: number;
  anchor_format: string;
  skill_md: { max_bytes: number };
  clauses: Clause[];
}

const contract = yaml.load(
  readFileSync(join(repoRoot, "contract.yaml"), "utf8")
) as Contract;
const digestSchema = yaml.load(
  readFileSync(join(repoRoot, "digest-schema.yaml"), "utf8")
) as any;
const logSchema = yaml.load(
  readFileSync(join(repoRoot, "log-schema.yaml"), "utf8")
) as any;

// ---- SKILL.md + stub detection ---------------------------------------------

const skillBytes = readFileSync(join(repoRoot, "SKILL.md")); // raw bytes (gate 4)
const skillText = skillBytes.toString("utf8");

/** YAML frontmatter of SKILL.md, parsed as data ({} if none). */
function skillFrontmatter(): Record<string, unknown> {
  const m = skillText.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  return (yaml.load(m[1]) as Record<string, unknown>) ?? {};
}

const description = String(skillFrontmatter().description ?? "");
// The literal stub marker. When T4's real description lands (no STUB),
// SKILL_IS_STUB flips to false and every skipped gate below arms itself.
const SKILL_IS_STUB = description.includes("STUB");

const STUB_REASON =
  " [SKIPPED: SKILL.md is the T4 stub — this gate arms automatically when T4 lands]";
const note = SKILL_IS_STUB ? STUB_REASON : "";

/** Anchor literal for a clause id per contract.yaml's anchor_format. */
function anchorFor(id: string): string {
  return contract.anchor_format.replace("<id>", id);
}

// ============================================================================
// A. The five Type-B gates
// ============================================================================

// Gate 1 — clause anchors: for EVERY clause id in contract.yaml (parsed as
// data, never hardcoded), SKILL.md contains the literal `contract:<id>`.
describe.skipIf(SKILL_IS_STUB)(`gate 1: clause anchors in SKILL.md${note}`, () => {
  it.each(contract.clauses.map((c) => [c.id]))(
    "SKILL.md carries the literal anchor for clause %s",
    (id) => {
      const anchor = anchorFor(id);
      expect(
        skillText.includes(anchor),
        `SKILL.md must contain the literal anchor "${anchor}" (contract.yaml anchor_format)`
      ).toBe(true);
    }
  );
});

// Gate 2 — logger call sites: the playbook invokes scripts/log-invocation at
// start (open) AND at end (finalize).
describe.skipIf(SKILL_IS_STUB)(`gate 2: logger call sites in SKILL.md${note}`, () => {
  it("references scripts/log-invocation", () => {
    expect(
      skillText.includes("scripts/log-invocation"),
      "SKILL.md must reference scripts/log-invocation"
    ).toBe(true);
  });

  it("invokes the logger's open subcommand (log at start)", () => {
    expect(
      /log-invocation['"`]?\s+open\b/.test(skillText),
      "SKILL.md must show a `scripts/log-invocation open` call site"
    ).toBe(true);
  });

  it("invokes the logger's finalize subcommand (log at end)", () => {
    expect(
      /log-invocation['"`]?\s+finalize\b/.test(skillText),
      "SKILL.md must show a `scripts/log-invocation finalize` call site"
    ).toBe(true);
  });
});

// Gate 3 — verify-fallback ladder: all three rungs named, in ladder order
// (runnable binary > test suite > minimal example, per the always-verify
// clause).
describe.skipIf(SKILL_IS_STUB)(`gate 3: verify-fallback ladder in SKILL.md${note}`, () => {
  const rungs = ["runnable binary", "test suite", "minimal example"];

  it("the rung names match the always-verify clause statement (spec cross-check)", () => {
    const clause = contract.clauses.find((c) => c.id === "always-verify");
    expect(clause, "contract.yaml must have an always-verify clause").toBeDefined();
    for (const rung of rungs) expect(clause!.statement).toContain(rung);
  });

  it("all three rungs are named in SKILL.md, in ladder order", () => {
    const positions = rungs.map((rung) => ({
      rung,
      idx: skillText.indexOf(rung),
    }));
    for (const { rung, idx } of positions) {
      expect(idx, `SKILL.md must name the ladder rung "${rung}"`).toBeGreaterThanOrEqual(0);
    }
    for (let i = 1; i < positions.length; i++) {
      expect(
        positions[i].idx,
        `ladder order violated: "${positions[i - 1].rung}" must appear before "${positions[i].rung}"`
      ).toBeGreaterThan(positions[i - 1].idx);
    }
  });
});

// Gate 4 — byte budget. Runs NOW (no skipIf): the stub trivially passes; the
// gate exists so T4 cannot blow the budget pinned in contract.yaml.
describe("gate 4: SKILL.md byte budget", () => {
  it(`SKILL.md is <= contract.yaml skill_md.max_bytes`, () => {
    const max = contract.skill_md.max_bytes;
    expect(typeof max).toBe("number");
    expect(
      skillBytes.length,
      `SKILL.md is ${skillBytes.length} bytes; budget is ${max} (contract.yaml skill_md.max_bytes)`
    ).toBeLessThanOrEqual(max);
  });
});

// Gate 5 — self-update pin (D23): the contract:self-update anchor, the
// literal --ff-only, and the time-bound wording, consistent with the
// self-update clause statement read as data.
describe.skipIf(SKILL_IS_STUB)(`gate 5: self-update pin (D23) in SKILL.md${note}`, () => {
  const clause = contract.clauses.find((c) => c.id === "self-update");

  it("contract.yaml's self-update clause itself carries --ff-only and the 5-second bound (spec cross-check)", () => {
    expect(clause, "contract.yaml must have a self-update clause").toBeDefined();
    expect(clause!.statement).toContain("--ff-only");
    expect(/5[- ]second/.test(clause!.statement)).toBe(true);
  });

  it("SKILL.md carries the contract:self-update anchor", () => {
    expect(skillText.includes(anchorFor("self-update"))).toBe(true);
  });

  it("SKILL.md carries the literal --ff-only", () => {
    expect(skillText.includes("--ff-only")).toBe(true);
  });

  it("SKILL.md carries the time-bound wording (5-second / 5 seconds)", () => {
    expect(
      /5-second|5 seconds/.test(skillText),
      'SKILL.md self-update wording must state the hard time bound ("5-second" or "5 seconds")'
    ).toBe(true);
  });
});

// ============================================================================
// B. Spec-integrity gates — run NOW, no skip
// ============================================================================

describe("spec-integrity: contract.yaml", () => {
  it("parses with version, anchor_format, and skill_md.max_bytes", () => {
    expect(contract.version).toBeDefined();
    expect(typeof contract.anchor_format).toBe("string");
    expect(contract.anchor_format).toContain("<id>"); // substitutable form
    expect(typeof contract.skill_md.max_bytes).toBe("number");
    expect(contract.skill_md.max_bytes).toBeGreaterThan(0);
  });

  it("has a clauses list where every clause has id, statement, source, and a boolean delta", () => {
    expect(Array.isArray(contract.clauses)).toBe(true);
    expect(contract.clauses.length).toBeGreaterThan(0);
    for (const clause of contract.clauses) {
      expect(typeof clause.id, `clause missing id: ${JSON.stringify(clause)}`).toBe("string");
      expect(typeof clause.statement, `clause ${clause.id} missing statement`).toBe("string");
      expect(clause.source, `clause ${clause.id} missing source`).toBeDefined();
      expect(typeof clause.delta, `clause ${clause.id}: delta must be a boolean`).toBe("boolean");
    }
  });

  it("clause ids are unique", () => {
    const ids = contract.clauses.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("spec-integrity: digest-schema.yaml", () => {
  const grammar = digestSchema.body.citation_grammar;

  it("parses and pins citation_grammar.version 1.1", () => {
    expect(grammar.version).toBe("1.1");
  });

  it("token_pattern compiles as a JS regex and full-matches/rejects the canonical examples", () => {
    // Lookaheads in the pattern are fine in JS.
    const tokenRe = new RegExp(`^(?:${grammar.token_pattern})$`);
    expect(tokenRe.test("⟦a/b.go:L10-L42⟧@deadbeefcafe")).toBe(true); // 12-hex suffix
    expect(tokenRe.test("⟦a/b.go:L10-L42⟧@deadbeef")).toBe(false); // 8-hex suffix: not a full token
  });

  it("dependency_kind enum EQUALS log-schema.yaml's (cross-schema drift gate)", () => {
    const digestKinds = digestSchema.frontmatter.required.dependency_kind.enum;
    const logKinds = logSchema.fields.dependency_kind.enum;
    expect(digestKinds).toEqual(logKinds);
  });
});

describe("spec-integrity: log-schema.yaml", () => {
  it("parses; lifecycle events are exactly [opened, finalized]", () => {
    expect(logSchema.lifecycle.events).toEqual(["opened", "finalized"]);
  });

  it("file.append_only is true", () => {
    expect(logSchema.file.append_only).toBe(true);
  });

  it("outcome enum has exactly the four canonical values", () => {
    // Deliberately a literal list: this gate exists to catch drift in the
    // schema itself (D21 outcome semantics).
    expect(logSchema.fields.outcome.enum).toEqual([
      "completed",
      "completed-unverified",
      "install-failure",
      "aborted",
    ]);
  });

  it("lifecycle join rule (D36): first schema-valid finalized wins; anomalies tallied", () => {
    const rule = String(logSchema.lifecycle.join_rule ?? "");
    expect(rule).toMatch(/first schema-valid finalized line per id wins/);
    expect(rule).toMatch(/anomalies, tallied separately/);
    expect(rule).toMatch(/read-side/); // never written back to the log
  });

  it("sha presence (D33): logger-enforced for completed; presence means a pin for completed-unverified", () => {
    const presence = String(logSchema.fields.sha.presence ?? "");
    expect(presence).toMatch(/required when outcome is completed \(logger-enforced\)/);
    expect(presence).toMatch(/presence means a pin/);
  });

  it("digest_sha256 (D35/D10) is passive evidence: present in the schema, never verified", () => {
    const field = logSchema.fields.digest_sha256;
    expect(field).toBeDefined();
    expect(field.pattern).toBe("^[0-9a-f]{64}$");
    // Coupled to a served digest (logger-enforced), logged alone at persist.
    expect(String(field.presence)).toMatch(/required together with consulted_cached_digest/);
    expect(String(field.presence)).toMatch(/persisted/);
  });
});

// ============================================================================
// C. Stub-marker consistency meta-gate — runs NOW, both states
// ============================================================================
// Guards the self-arming mechanism itself: if T4 lands real playbook content
// but the frontmatter description still carries the STUB marker (forgotten
// edit), the 17 skipped gates would stay skipped FOREVER with green CI. This
// meta-gate fails loudly in that state: a STUB-marked SKILL.md must not
// already carry contract anchors.
describe("stub-marker consistency", () => {
  it("a STUB-marked SKILL.md carries no contract anchors (else remove the marker so the gates arm)", () => {
    if (!SKILL_IS_STUB) return; // armed state: gates 1/2/3/5 cover content
    for (const c of contract.clauses) {
      expect(
        skillText.includes(anchorFor(c.id)),
        `SKILL.md is marked STUB but already carries the anchor for "${c.id}" — remove the STUB marker from the frontmatter description so the Type-B gates arm`
      ).toBe(false);
    }
  });
});
