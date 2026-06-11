// T3 Type-C deterministic gates for scripts/log-invocation.
//
// Spec-as-data pinning (D21): field names, enums, and outcome semantics are
// loaded from log-schema.yaml parsed as data — never hardcoded copies. Every
// test runs against a unique temp TESSER_HOME (mkdtemp); the real ~/.tesser/
// is never touched.

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import yaml from "js-yaml";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT = join(repoRoot, "scripts", "log-invocation");

// ---- log-schema.yaml parsed as data (the single source of truth) ----------

interface FieldSpec {
  type: string;
  enum?: string[];
  pattern?: string;
  events: string[];
  presence?: string;
}
interface LogSchema {
  version: number;
  lifecycle: { events: string[] };
  fields: Record<string, FieldSpec>;
}

const schema = yaml.load(
  readFileSync(join(repoRoot, "log-schema.yaml"), "utf8")
) as LogSchema;

const OUTCOMES = schema.fields.outcome.enum!;
const KINDS = schema.fields.dependency_kind.enum!;
const SHA_RE = new RegExp(schema.fields.sha.pattern!);

/** Field names the schema allows on a given event's lines. */
function fieldsFor(event: string): string[] {
  return Object.entries(schema.fields)
    .filter(([, spec]) => spec.events.includes(event))
    .map(([name]) => name);
}
/** Fields with no presence qualifier are unconditionally required. */
function requiredFor(event: string): string[] {
  return Object.entries(schema.fields)
    .filter(([, spec]) => spec.events.includes(event) && !spec.presence)
    .map(([name]) => name);
}

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const UUID4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// ---- harness ---------------------------------------------------------------

function freshHome(): string {
  return mkdtempSync(join(tmpdir(), "tesser-logger-test-"));
}

function run(home: string, args: string[], cwd?: string) {
  const res = spawnSync(SCRIPT, args, {
    env: { ...process.env, TESSER_HOME: home },
    encoding: "utf8",
    cwd,
  });
  if (res.error) throw res.error;
  return res;
}

function logPath(home: string): string {
  return join(home, "log.jsonl");
}
function logBytes(home: string): Buffer {
  return existsSync(logPath(home))
    ? readFileSync(logPath(home))
    : Buffer.alloc(0);
}
function logLines(home: string): Record<string, unknown>[] {
  const raw = logBytes(home).toString("utf8");
  if (raw === "") return [];
  expect(raw.endsWith("\n")).toBe(true); // every record is a full line
  return raw
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l));
}

function openOk(home: string, question: string, repo?: string): string {
  const args = ["open", "--question", question];
  if (repo) args.push("--repo", repo);
  const res = run(home, args);
  expect(res.status).toBe(0);
  const id = res.stdout.trim();
  expect(id).toMatch(UUID4_RE); // schema: id format uuid-v4
  return id;
}

const VALID_SHA = "0123456789abcdef0123456789abcdef01234567";

// ---- gates ------------------------------------------------------------------

describe("gate 1 — open-at-start, walk-away never force-finalized", () => {
  it("open appends the opened line per schema even if finalize never runs", () => {
    const home = freshHome();
    const id = openOk(home, "how does serde derive work?", "https://github.com/serde-rs/serde");

    const lines = logLines(home);
    expect(lines).toHaveLength(1);
    const opened = lines[0];

    // Schema-pinned field set: all unconditionally-required opened fields
    // present, no field outside the schema's opened-event set.
    const allowed = fieldsFor("opened");
    const required = requiredFor("opened");
    expect(Object.keys(opened).sort()).toEqual(
      [...required, "repo"].sort() // repo is the only optional opened field we supplied
    );
    for (const k of Object.keys(opened)) expect(allowed).toContain(k);

    expect(opened.id).toBe(id);
    expect(opened.event).toBe("opened");
    expect(opened.ts).toMatch(ISO_UTC_RE);
    expect(opened.question).toBe("how does serde derive work?");
    expect(schema.fields.invocation_source.enum).toContain(
      opened.invocation_source
    );

    // Walk away from this record, then do further unrelated ops.
    const id2 = openOk(home, "unrelated second question");
    const res = run(home, ["finalize", "--id", id2, "--outcome", OUTCOMES[0], "--sha", VALID_SHA]);
    expect(res.status).toBe(0);

    // The first record must still be opened-only: nothing force-finalized it.
    const after = logLines(home);
    const firstRecordEvents = after.filter((l) => l.id === id);
    expect(firstRecordEvents).toHaveLength(1);
    expect(firstRecordEvents[0].event).toBe("opened");
  });
});

describe("gate 2 — finalize outcome enum + digest-served semantics", () => {
  it("accepts exactly the schema's outcome enum", () => {
    const home = freshHome();
    for (const outcome of OUTCOMES) {
      const id = openOk(home, `q for ${outcome}`);
      const res = run(home, ["finalize", "--id", id, "--outcome", outcome, "--sha", VALID_SHA]);
      expect(res.status, `outcome ${outcome} must be accepted: ${res.stderr}`).toBe(0);
      const last = logLines(home).at(-1)!;
      expect(last.event).toBe("finalized");
      expect(last.outcome).toBe(outcome);
      // No field outside the schema's finalized-event set.
      const allowed = fieldsFor("finalized");
      for (const k of Object.keys(last)) expect(allowed).toContain(k);
      for (const k of requiredFor("finalized")) expect(last).toHaveProperty(k);
    }
  });

  it("rejects an unknown outcome with nonzero exit and zero bytes appended", () => {
    const home = freshHome();
    const id = openOk(home, "q");
    const before = logBytes(home);
    const res = run(home, ["finalize", "--id", id, "--outcome", "done"]);
    expect(res.status).not.toBe(0);
    expect(logBytes(home).equals(before)).toBe(true);
  });

  it("accepts every dependency_kind slug in the schema enum (drift gate)", () => {
    // Mirrors the outcome loop: if the script's DEPENDENCY_KINDS constant
    // drops or misspells any schema slug, this fails — the duplicated
    // constant cannot drift from log-schema.yaml undetected.
    const home = freshHome();
    for (const kind of KINDS) {
      const id = openOk(home, `q for ${kind}`);
      const res = run(home, [
        "finalize", "--id", id, "--outcome", OUTCOMES[0],
        "--sha", VALID_SHA, "--dependency-kind", kind,
      ]);
      expect(res.status, `kind ${kind} must be accepted: ${res.stderr}`).toBe(0);
      expect(logLines(home).at(-1)!.dependency_kind).toBe(kind);
    }
  });

  it("digest-served run is completed WITH consulted_cached_digest set (no separate outcome)", () => {
    const home = freshHome();
    // Pin the field name against the schema, not a hardcoded copy.
    expect(Object.keys(schema.fields)).toContain("consulted_cached_digest");
    expect(OUTCOMES).not.toContain("digest-served");

    const digest = join(home, "some-digest.md");
    writeFileSync(digest, "# digest\n");
    const id = openOk(home, "digest-served question");
    const res = run(home, [
      "finalize", "--id", id, "--outcome", "completed",
      "--sha", VALID_SHA, "--digest", digest, "--digest-sha256", "cd".repeat(32),
    ]);
    expect(res.status).toBe(0);
    const last = logLines(home).at(-1)!;
    expect(last.outcome).toBe("completed");
    expect(last.consulted_cached_digest).toBe(digest);
  });
});

describe("gate — sha presence is logger-enforced for completed (D33)", () => {
  it("finalize --outcome completed without --sha is exit 2 with zero bytes appended", () => {
    const home = freshHome();
    const id = openOk(home, "completed without a pin?");
    const before = logBytes(home);
    const res = run(home, ["finalize", "--id", id, "--outcome", "completed"]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/--sha is required/);
    expect(logBytes(home).equals(before)).toBe(true);
  });

  it("completed-unverified without --sha is accepted (no pin happened)", () => {
    // The schema says sha presence here MEANS a pin happened — e.g. a
    // docs-grade answer after a failed clone legitimately has no sha.
    expect(schema.fields.sha.presence).toMatch(/pin/);
    const home = freshHome();
    const id = openOk(home, "docs-grade answer after failed clone");
    const res = run(home, ["finalize", "--id", id, "--outcome", "completed-unverified"]);
    expect(res.status, res.stderr).toBe(0);
    const last = logLines(home).at(-1)!;
    expect(last.outcome).toBe("completed-unverified");
    expect(last).not.toHaveProperty("sha");
  });

  it("completed-unverified with --sha is accepted (a pin happened)", () => {
    const home = freshHome();
    const id = openOk(home, "pinned but a verify rung failed");
    const res = run(home, [
      "finalize", "--id", id, "--outcome", "completed-unverified", "--sha", VALID_SHA,
    ]);
    expect(res.status, res.stderr).toBe(0);
    expect(logLines(home).at(-1)!.sha).toBe(VALID_SHA);
  });
});

describe("gate — digest_sha256 passive evidence (D35/D10)", () => {
  it("the field is schema-pinned and emitted verbatim on finalized lines", () => {
    expect(Object.keys(schema.fields)).toContain("digest_sha256");
    const home = freshHome();
    const digest = join(home, "served-digest.md");
    writeFileSync(digest, "# digest\n");
    const hash = "ab".repeat(32); // 64 hex chars
    const id = openOk(home, "digest-served with hash evidence");
    const res = run(home, [
      "finalize", "--id", id, "--outcome", "completed",
      "--sha", VALID_SHA, "--digest", digest, "--digest-sha256", hash,
    ]);
    expect(res.status, res.stderr).toBe(0);
    const last = logLines(home).at(-1)!;
    expect(last.digest_sha256).toBe(hash);
    expect(new RegExp(schema.fields.digest_sha256.pattern).test(hash)).toBe(true);
  });

  it.each([["ab".repeat(31) + "a"], ["AB".repeat(32)], ["not-a-hash"]])(
    "malformed digest-sha256 %s is rejected with zero bytes appended",
    (bad) => {
      const home = freshHome();
      const id = openOk(home, "q");
      const before = logBytes(home);
      const res = run(home, [
        "finalize", "--id", id, "--outcome", "completed",
        "--sha", VALID_SHA, "--digest-sha256", bad,
      ]);
      expect(res.status).not.toBe(0);
      expect(logBytes(home).equals(before)).toBe(true);
    },
  );

  it("--digest without --digest-sha256 is rejected — a served digest logs its hash (D35)", () => {
    const home = freshHome();
    const digest = join(home, "served-digest.md");
    writeFileSync(digest, "# digest\n");
    const id = openOk(home, "served without hash?");
    const before = logBytes(home);
    const res = run(home, [
      "finalize", "--id", id, "--outcome", "completed",
      "--sha", VALID_SHA, "--digest", digest,
    ]);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/--digest-sha256/);
    expect(logBytes(home).equals(before)).toBe(true);

    // Hash-only (persist without a cached serve) stays legal.
    const res2 = run(home, [
      "finalize", "--id", id, "--outcome", "completed",
      "--sha", VALID_SHA, "--digest-sha256", "ef".repeat(32),
    ]);
    expect(res2.status, res2.stderr).toBe(0);
  });
});

describe("gate 3 — seeded/self derivation via the first-run marker", () => {
  it("first open in a fresh TESSER_HOME is seeded and creates the marker; second is self", () => {
    const home = freshHome();
    const markerPath = join(home, "first-run");
    expect(existsSync(markerPath)).toBe(false);

    openOk(home, "first ever question");
    let lines = logLines(home);
    expect(lines[0].invocation_source).toBe("seeded");

    expect(existsSync(markerPath)).toBe(true);
    const marker = readFileSync(markerPath, "utf8");
    expect(marker.endsWith("\n")).toBe(true); // newline-terminated
    expect(marker.trimEnd()).toMatch(ISO_UTC_RE); // ISO-8601 UTC contents

    openOk(home, "second question");
    lines = logLines(home);
    expect(lines[1].invocation_source).toBe("self");
    // Marker never rewritten.
    expect(readFileSync(markerPath, "utf8")).toBe(marker);
  });
});

describe("gate 4 — marker survives skill-directory deletion", () => {
  it("state lives under TESSER_HOME, not the skill dir; reinstall stays self", () => {
    const home = freshHome();
    const fakeSkillDir = mkdtempSync(join(tmpdir(), "tesser-fake-skill-"));

    openOk(home, "question from inside the skill dir", undefined);
    // Re-run from inside the fake skill dir to prove cwd is irrelevant.
    const res = run(home, ["open", "--question", "q from skill cwd"], fakeSkillDir);
    expect(res.status).toBe(0);

    // No state landed in the skill dir; the marker is under TESSER_HOME.
    expect(readdirSync(fakeSkillDir)).toHaveLength(0);
    expect(existsSync(join(home, "first-run"))).toBe(true);

    // "Reinstall": delete the skill dir entirely, then invoke again.
    rmSync(fakeSkillDir, { recursive: true, force: true });
    openOk(home, "question after skill reinstall");
    const last = logLines(home).at(-1)!;
    expect(last.invocation_source).toBe("self"); // not re-seeded
  });
});

describe("gate 5 — failing_command + exit_code travel together", () => {
  it("captures both when supplied; exit_code is a JSON integer", () => {
    const home = freshHome();
    const id = openOk(home, "build fails");
    const res = run(home, [
      "finalize", "--id", id, "--outcome", "install-failure",
      "--failing-command", "cargo build --release", "--exit-code", "101",
    ]);
    expect(res.status).toBe(0);
    const last = logLines(home).at(-1)!;
    expect(last.failing_command).toBe("cargo build --release");
    expect(last.exit_code).toBe(101);
    expect(typeof last.exit_code).toBe("number"); // schema: type integer
  });

  it("one without the other is a hard error with nothing appended", () => {
    const home = freshHome();
    const id = openOk(home, "q");
    const before = logBytes(home);
    for (const partial of [
      ["--failing-command", "make"],
      ["--exit-code", "2"],
    ]) {
      const res = run(home, ["finalize", "--id", id, "--outcome", "aborted", ...partial]);
      expect(res.status).not.toBe(0);
      expect(logBytes(home).equals(before)).toBe(true);
    }
  });
});

describe("gate 6 — malformed-args rejection + append-only integrity", () => {
  it("malformed invocations leave the log byte-identical; valid ones append exactly one line", () => {
    const home = freshHome();
    const id = openOk(home, "baseline question");
    const snapshot = logBytes(home);
    const uuid = randomUUID();

    const malformed: string[][] = [
      ["open"], // missing --question
      ["finalize", "--id", uuid, "--outcome", "done"], // bad outcome
      ["finalize", "--id", uuid, "--outcome", OUTCOMES[0], "--sha", "abc123"], // bad sha
      ["finalize", "--id", uuid, "--outcome", OUTCOMES[0], "--sha", VALID_SHA.toUpperCase()], // uppercase sha
      ["finalize", "--id", uuid, "--outcome", "completed"], // completed without --sha (D33)
      ["finalize", "--id", uuid, "--outcome", OUTCOMES[0], "--sha", VALID_SHA, "--digest", join(home, "no-such-digest.md")], // nonexistent digest (D14)
      ["finalize", "--id", uuid, "--outcome", OUTCOMES[0], "--sha", VALID_SHA, "--dependency-kind", "saas"], // bad kind slug
      ["finalize", "--id", uuid, "--outcome", OUTCOMES[0], "--sha", VALID_SHA, "--digest-sha256", "deadbeef"], // bad digest hash (D35)
      ["finalize", "--id", "not-a-uuid", "--outcome", OUTCOMES[0]], // bad id
      ["finalize", "--outcome", OUTCOMES[0]], // missing --id
      ["finalize", "--id", uuid], // missing --outcome
      ["finalize", "--id", uuid, "--outcome", OUTCOMES[0], "--sha", VALID_SHA, "--failing-command", "make", "--exit-code", "two"], // non-integer exit code
    ];
    for (const args of malformed) {
      const res = run(home, args);
      expect(res.status, `expected failure for: ${args.join(" ")}`).not.toBe(0);
      expect(
        logBytes(home).equals(snapshot),
        `log mutated by malformed call: ${args.join(" ")}`
      ).toBe(true);
    }

    // Bad sha and bad kind really are out-of-schema, not test typos.
    expect(SHA_RE.test("abc123")).toBe(false);
    expect(KINDS).not.toContain("saas");

    // A question with embedded newline, quotes, and non-ASCII stays one
    // JSONL line (json escaping) and round-trips verbatim per the schema.
    const gnarly = 'why does fmt::Display panic?\nsee "léger" ⟦weird⟧';
    const gnarlyId = openOk(home, gnarly);
    const gnarlyLines = logLines(home); // logLines asserts line integrity
    const gnarlyRec = gnarlyLines.find((l) => l.id === gnarlyId)!;
    expect(gnarlyRec.question).toBe(gnarly);
    const snapshot2 = logBytes(home);

    // Valid sequence: each call appends exactly one line, and the previous
    // bytes remain a strict prefix (append-only — never rewritten).
    let prev = snapshot2;
    const valid: string[][] = [
      ["open", "--question", "valid follow-up"],
      ["finalize", "--id", id, "--outcome", OUTCOMES[0], "--sha", VALID_SHA, "--dependency-kind", KINDS[0]],
      ["finalize", "--id", uuid, "--outcome", "aborted"],
    ];
    for (const args of valid) {
      const res = run(home, args);
      expect(res.status, res.stderr).toBe(0);
      const now = logBytes(home);
      expect(now.length).toBeGreaterThan(prev.length);
      expect(now.subarray(0, prev.length).equals(prev)).toBe(true); // strict prefix
      const appended = now.subarray(prev.length).toString("utf8");
      expect(appended.split("\n").filter((l) => l !== "")).toHaveLength(1);
      prev = now;
    }
  });
});
