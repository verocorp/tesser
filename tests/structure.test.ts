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
  // surface: where the clause is enforced. "playbook" (default) = anchored in
  // SKILL.md/subagent-brief prose (gate 1). "script" = owned by a deterministic
  // binary (scripts/fetch) and assured by its Type-C tests, NOT a prose anchor
  // (grounding-design.md, 2026-06-17 — digest-consult, idempotent-reuse).
  surface?: "playbook" | "script";
}
interface Contract {
  version: number;
  anchor_format: string;
  skill_md: { max_bytes: number };
  subagent_brief: { max_bytes: number };
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
const scoreboard = yaml.load(
  readFileSync(join(repoRoot, "scoreboard.yaml"), "utf8")
) as any;

/** The FINAL forbidden-lexicon literal terms (D41), parsed from scoreboard.yaml
 *  as data. The raw-citation-markup entry (contains ⟦) is not a literal term —
 *  it is enforced by a separate shape check — so it is filtered out here. */
const forbiddenLexicon: string[] = (
  scoreboard?.axes?.digestible?.checks?.no_internal_lexicon_leak
    ?.forbidden_lexicon ?? []
).filter((t: unknown): t is string => typeof t === "string" && !t.includes("⟦"));

// ---- SKILL.md + stub detection ---------------------------------------------

const skillBytes = readFileSync(join(repoRoot, "SKILL.md")); // raw bytes (gate 4)
const skillText = skillBytes.toString("utf8");

// The playbook now spans two files: SKILL.md (the main-thread router + dev-facing
// output contract + the build path) and subagent-brief.md (the grounding machinery
// the background subagent runs). Clause anchors, logger call sites, and the
// self-update pin may live in EITHER file, so the content gates (1, 2, 5) read the
// union. The byte budget (gate 4) and the dev-facing gates (6, 7) stay SKILL.md-only.
const briefText = readFileSync(join(repoRoot, "subagent-brief.md"), "utf8");
const playbookText = skillText + "\n" + briefText;

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

// Gate 1 — clause anchors: for every PLAYBOOK-surfaced clause in contract.yaml
// (parsed as data), the playbook contains the literal `contract:<id>`. Clauses
// marked `surface: script` are owned by a deterministic binary (scripts/fetch)
// and assured by its Type-C tests instead of a prose anchor, so they are exempt
// (grounding-design.md, 2026-06-17).
const playbookClauses = contract.clauses.filter((c) => c.surface !== "script");
describe.skipIf(SKILL_IS_STUB)(`gate 1: clause anchors in the playbook${note}`, () => {
  it.each(playbookClauses.map((c) => [c.id]))(
    "the playbook carries the literal anchor for clause %s",
    (id) => {
      const anchor = anchorFor(id);
      expect(
        playbookText.includes(anchor),
        `the playbook (SKILL.md or subagent-brief.md) must contain the literal anchor "${anchor}" (contract.yaml anchor_format)`
      ).toBe(true);
    }
  );

  it("a script-surfaced clause is exempt from the anchor requirement (and IS marked script)", () => {
    // Guard the exemption itself: if a clause loses its anchor it must be
    // because it was deliberately demoted to surface: script, not by accident.
    const scriptClauses = contract.clauses.filter((c) => c.surface === "script");
    for (const c of scriptClauses) {
      expect(
        c.surface,
        `clause ${c.id} is exempt from gate 1 only because surface: script`
      ).toBe("script");
    }
  });
});

// Gate 2 — logger call sites: the playbook invokes scripts/log-invocation at
// start (open) AND at end (finalize).
describe.skipIf(SKILL_IS_STUB)(`gate 2: logger call sites in the playbook${note}`, () => {
  it("references scripts/log-invocation", () => {
    expect(
      playbookText.includes("scripts/log-invocation"),
      "the playbook must reference scripts/log-invocation"
    ).toBe(true);
  });

  it("invokes the logger's open subcommand (log at start)", () => {
    expect(
      /log-invocation['"`]?\s+open\b/.test(playbookText),
      "the playbook must show a `scripts/log-invocation open` call site"
    ).toBe(true);
  });

  it("invokes the logger's finalize subcommand (log at end)", () => {
    expect(
      /log-invocation['"`]?\s+finalize\b/.test(playbookText),
      "the playbook must show a `scripts/log-invocation finalize` call site"
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

  it(`subagent-brief.md is <= contract.yaml subagent_brief.max_bytes`, () => {
    const max = contract.subagent_brief.max_bytes;
    const briefBytes = Buffer.byteLength(briefText, "utf8");
    expect(typeof max).toBe("number");
    expect(
      briefBytes,
      `subagent-brief.md is ${briefBytes} bytes; budget is ${max} (contract.yaml subagent_brief.max_bytes)`
    ).toBeLessThanOrEqual(max);
  });
});

// Gate 6 — internal-lexicon containment (D41). The leak axis's free Type-B ring
// (testing-agent-skills principles 3 + 10): catch a jargon-leak regression for
// FREE, every merge, instead of waiting on an expensive model run.
//
// (a) Negative pin — the exact class we removed: a square-bracketed grade-label
// template (`[provisional — inspect-grade, widget@…]`) the agent copies verbatim
// into human output. None may reappear. Runs always (a stub trivially passes).
describe("gate 6a: no bracketed grade-label template in SKILL.md (D41)", () => {
  it("contains no bracketed grade-label example (agents copy it into output)", () => {
    const m = skillText.match(/\[[^\]\n]*(provisional|[a-z]+-grade)[^\]\n]*\]/i);
    expect(
      m,
      `SKILL.md must not show a bracketed grade-label example (agents copy it into human output). Found: ${m?.[0]}`
    ).toBeNull();
  });
});

// (b) Sync pin — the playbook's Output-contract ban must document EVERY term in
// scoreboard.yaml's final forbidden_lexicon (spec-as-data: scorer and playbook
// draw the ban from one source). Drift in either direction fails here.
describe.skipIf(SKILL_IS_STUB)(`gate 6b: Output-contract documents the full forbidden lexicon (D41)${note}`, () => {
  const rule = (() => {
    const m = skillText.match(
      /never leak the internal vocabulary[\s\S]*?(?=\n- \*\*|\n#{2,3} )/
    );
    return m ? m[0] : "";
  })();

  it("SKILL.md carries the Output contract's plain-language no-leak rule", () => {
    expect(skillText.includes("Output contract")).toBe(true);
    expect(rule.length, "the plain-language no-leak rule must be present").toBeGreaterThan(0);
  });

  it("the scoreboard forbidden_lexicon parses to a non-empty literal-term list", () => {
    expect(forbiddenLexicon.length).toBeGreaterThanOrEqual(1);
  });

  it.each(forbiddenLexicon.map((t) => [t]))(
    'the Output-contract ban lists the forbidden term "%s" (scoreboard.yaml sync)',
    (term) => {
      expect(
        rule.includes(term),
        `scoreboard.yaml forbids "${term}" but SKILL.md's Output-contract ban does not list it`
      ).toBe(true);
    }
  );
});

// Gate 7 — two-beat overview + machinery silence (Chris dogfood 2026-06-13).
// The mosh/gds dogfood showed the overview path was loud: foreground bash before
// the answer, a bash block after it, and a no-op "drift check: no drift —
// everything is current" success report. The excellent shape Chris specified is
// two beats: (1) kick off the grounding in the background + answer immediately
// from knowledge; (2) the grounding stays SILENT on success, speaking again only
// to correct. These gates pin that shape into the playbook so it can't regress.
describe.skipIf(SKILL_IS_STUB)(`gate 7: two-beat overview machinery-silence (D42)${note}`, () => {
  it("the overview answers from the model's own knowledge first (not after the clone)", () => {
    expect(
      /from what you (already )?know/i.test(skillText),
      'SKILL.md must instruct answering the overview from knowledge first ("from what you already know")'
    ).toBe(true);
  });

  it("grounding runs in the background and never blocks the answer", () => {
    expect(
      /never blocks the answer/i.test(skillText),
      'SKILL.md must state the background grounding "never blocks the answer"'
    ).toBe(true);
  });

  it("the grounding is SILENT on success — says nothing when it confirms", () => {
    expect(
      /confirms[\s\S]{0,80}(say nothing|stays? silent|no follow-up)/i.test(skillText),
      'SKILL.md must instruct silence when the background grounding confirms the answer'
    ).toBe(true);
  });

  it("the grounding speaks again only to correct — a superseding follow-up", () => {
    expect(
      /(only )?to correct[\s\S]{0,80}supersed|supersed[\s\S]{0,80}(differ|moved|stale|wrong)/i.test(skillText),
      "SKILL.md must instruct a superseding correction only when the source differs"
    ).toBe(true);
  });

  it("NO no-op success announcement: never 'no drift' / 'drift-unchecked' in dev-facing flow", () => {
    expect(
      /no drift/i.test(skillText),
      'SKILL.md must not instruct emitting a "no drift" success report (kill the no-op confirmation)'
    ).toBe(false);
    expect(
      /drift-unchecked/i.test(skillText),
      'SKILL.md must not label a served answer "drift-unchecked" (internal status the dev never sees)'
    ).toBe(false);
  });

  it("citations live in the map, never a provenance block in the chat", () => {
    expect(
      /provenance (block|list)/i.test(skillText) === false || /never .*provenance (block|list)/i.test(skillText),
      "SKILL.md must not instruct a visible provenance block/list — citations live in the map"
    ).toBe(true);
    expect(
      /citations live in the (map|digest)/i.test(skillText),
      'SKILL.md must say citations live in the map, not the chat'
    ).toBe(true);
  });

  // The supersede (beat 2) leads with the corrected FACT, never narrates the act
  // of grounding (Letta dogfood 2026-06-14, judge: "now that I've checked it
  // against the actual source" was the weakest-principle seam — machinery silence
  // extended from beat 1 to beat 2; a grade change like "confirmed by running it"
  // is calibration the dev wants and stays in the build path, but "I read the
  // source"/"the grounding found" is machinery the dev never needs).
  it("the supersede leads with the corrected fact, never narrating the act of grounding", () => {
    expect(
      /never narrate the act of grounding/i.test(skillText),
      'SKILL.md beat 2 must instruct the supersede to lead with the corrected fact and not narrate the act of grounding ("now that I\'ve checked the source")'
    ).toBe(true);
  });
});

// Gate 8 — README-first beat-1 (D47, amended by grounding-design.md 2026-06-17).
// When the model does not know the dependency (tesser's founding case), the
// answer grounds in a fast docs acquisition (scripts/fetch docs — a treeless+
// sparse clone, ~1s) instead of a "hang on, I don't know this" holding line (the
// FASTER failure reproduced in session b40f75e1). The 2026-06-17 amendment: the
// fast acquisition is a sparse clone via the deterministic fetch script (NOT a
// raw gh-api GET, NOT "never a clone"), and the status line is GATED — only an
// unrecognized URL that must be searched warrants one. Pins the dev-facing
// WORDING + the gated-status discipline (a known URL leads silently).
// NOT verified here: that the agent actually invokes scripts/fetch at runtime
// (the Ring-D obedience e2e + scored dogfood own that). SKILL.md-only.
describe.skipIf(SKILL_IS_STUB)(`gate 8: README-first beat-1, gated status (D47 + 2026-06-17)${note}`, () => {
  it("names the unknown-dep case (the answer can't come from memory)", () => {
    expect(
      /don'?t recognize it|unfamiliar dependenc|when you don'?t (already )?know/i.test(skillText),
      "SKILL.md must name the case where the model does not know the dep"
    ).toBe(true);
  });

  it("grounds the unknown-dep answer via scripts/fetch docs (the fast sparse clone)", () => {
    expect(
      /scripts\/fetch docs/.test(skillText),
      "SKILL.md must ground an unknown dep via `scripts/fetch docs` (the deterministic fast acquisition)"
    ).toBe(true);
    expect(
      /not a full clone|treeless|sparse/i.test(skillText),
      "SKILL.md must convey the docs acquisition is fast (treeless+sparse, not a full clone)"
    ).toBe(true);
  });

  it("labels docs-sourced content as the project's own docs, never as verified", () => {
    expect(
      /project'?s own doc|going by (its|the) README/i.test(skillText),
      "SKILL.md must convey a docs answer as the project's own docs (docs-grade), not verified behavior"
    ).toBe(true);
  });

  it("kills the holding-line non-answer (it is the FASTER failure)", () => {
    expect(
      /holding line/i.test(skillText),
      'SKILL.md must call out the "holding line" non-answer as the speed failure to avoid'
    ).toBe(true);
  });

  // The gated-status discipline (replaces the old foreground/background backslide
  // guard): a status line is licensed ONLY for a genuine wait (an unknown URL
  // needing a search). A known/pasted URL leads silently with the docs answer —
  // narrating a fast deterministic fetch is the machinery noise gate 7 also kills.
  it("gates the status line to a real wait: the search line is the ONLY status line", () => {
    expect(
      /only\b[\s\S]{0,30}status line/i.test(skillText),
      'SKILL.md must say the search line is the ONLY status line it ever emits'
    ).toBe(true);
  });

  it("ties the one status line to a search (a known URL leads silently)", () => {
    expect(
      /search[\s\S]{0,200}status line|status line[\s\S]{0,80}known url|known url[\s\S]{0,80}(never|silent)/i.test(skillText),
      "SKILL.md must tie the status line to a search wait, and lead silently on a known URL"
    ).toBe(true);
  });
});

// Gate 5 — self-update pin (D23): the contract:self-update anchor, the
// literal --ff-only, and the time-bound wording, consistent with the
// self-update clause statement read as data.
describe.skipIf(SKILL_IS_STUB)(`gate 5: self-update pin (D23) in the playbook${note}`, () => {
  const clause = contract.clauses.find((c) => c.id === "self-update");

  it("contract.yaml's self-update clause itself carries --ff-only and the 5-second bound (spec cross-check)", () => {
    expect(clause, "contract.yaml must have a self-update clause").toBeDefined();
    expect(clause!.statement).toContain("--ff-only");
    expect(/5[- ]second/.test(clause!.statement)).toBe(true);
  });

  it("the playbook carries the contract:self-update anchor", () => {
    expect(playbookText.includes(anchorFor("self-update"))).toBe(true);
  });

  it("the playbook carries the literal --ff-only", () => {
    expect(playbookText.includes("--ff-only")).toBe(true);
  });

  it("the playbook carries the time-bound wording (5-second / 5 seconds)", () => {
    expect(
      /5-second|5 seconds/.test(playbookText),
      'the self-update wording must state the hard time bound ("5-second" or "5 seconds")'
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
    expect(typeof contract.subagent_brief.max_bytes).toBe("number");
    expect(contract.subagent_brief.max_bytes).toBeGreaterThan(0);
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
