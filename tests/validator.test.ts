// Type-A deterministic gates for scripts/validate-digest (T8).
//
// Patterns and enums are loaded from digest-schema.yaml (spec-as-data) at the
// points where they are asserted — the tests pin against the schema, not
// against copies of its values.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const validator = path.join(repoRoot, "scripts", "validate-digest");
const fixturesDir = path.join(repoRoot, "tests", "fixtures", "digests");
const goodFixture = path.join(fixturesDir, "acme--widget@0123456789ab.md");
const badFixture = path.join(
  fixturesDir,
  "bad--missing-fields@000000000000.md",
);

// digest-schema.yaml parsed as data — the source of every pattern/enum below.
const schema = yaml.load(
  fs.readFileSync(path.join(repoRoot, "digest-schema.yaml"), "utf8"),
) as any;
const required = schema.frontmatter.required;

const GOOD_SHA = "0123456789abcdef0123456789abcdef01234567";
const GOOD_SHA12 = GOOD_SHA.slice(0, 12);

let tmpRoot: string;
let caseCounter = 0;

function runValidator(digestPath: string, clone?: string) {
  const args = [digestPath, ...(clone ? ["--clone", clone] : [])];
  const res = spawnSync(validator, args, { encoding: "utf8" });
  if (res.error) throw res.error;
  return { status: res.status, stderr: res.stderr };
}

interface DigestOpts {
  repo?: string;
  sha?: string;
  body?: string;
  omit?: string[]; // frontmatter fields to drop
  filename?: string; // override the derived <org>--<repo>@<sha12>.md
  namePart?: string; // org--repo for the derived filename
}

// Write a digest built from a good template into a fresh temp subdir and
// return its path. Defaults produce a digest the validator accepts.
function writeDigest(opts: DigestOpts = {}): string {
  const sha = opts.sha ?? GOOD_SHA;
  const fm: Record<string, unknown> = {
    repo: opts.repo ?? "https://github.com/acme/widget.git",
    sha,
    env: { os: "darwin", arch: "arm64" },
    commands: [{ cmd: "make test", exit_code: 0 }],
    ts: "2026-06-10T18:04:00Z",
    // enum values come from the schema, not hardcoded copies
    dependency_kind: required.dependency_kind.enum[1],
    truth_grade: required.truth_grade.enum[0],
  };
  for (const field of opts.omit ?? []) delete fm[field];
  const body =
    opts.body ?? "\nA load-bearing claim ⟦src/widget.py:L1-L5⟧.\n";
  const namePart = opts.namePart ?? "acme--widget";
  const filename = opts.filename ?? `${namePart}@${sha.slice(0, 12)}.md`;
  const dir = path.join(tmpRoot, `case-${caseCounter++}`);
  fs.mkdirSync(dir, { recursive: true });
  const digestPath = path.join(dir, filename);
  fs.writeFileSync(digestPath, `---\n${yaml.dump(fm)}---\n${body}`);
  return digestPath;
}

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tesser-validator-"));
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// Gate 1 — every digest bundled in digests/ validates. Currently vacuous
// (the dir is empty until T9 lands), and bites on every digest added.
describe("gate 1: bundled digests", () => {
  it("every digest in digests/ passes validate-digest", () => {
    const bundledDir = path.join(repoRoot, "digests");
    const files = fs
      .readdirSync(bundledDir)
      .filter((f) => f.endsWith(".md"));
    for (const f of files) {
      const { status, stderr } = runValidator(path.join(bundledDir, f));
      expect(status, `digests/${f} failed validation:\n${stderr}`).toBe(0);
    }
  });
});

// Gate 2 — known-GOOD digest validates, including quote-in-range against a
// real fixture git repo created in a temp dir (file:// URL per D25/D8).
describe("gate 2: known-good digest, with quote-in-range", () => {
  let cloneDir: string;
  let cloneSha: string;
  let cloneDigest: string;

  beforeAll(() => {
    // org/repo path segments are lowercase so the file:// identity rule
    // (org = parent dir, repo = repo dir) yields the digest filename exactly.
    cloneDir = path.join(tmpRoot, "fixtureorg", "fixturerepo");
    fs.mkdirSync(path.join(cloneDir, "src"), { recursive: true });
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: cloneDir, encoding: "utf8" });
    git("init", "--quiet");
    git("config", "user.email", "fixtures@tesser.invalid");
    git("config", "user.name", "tesser fixtures");
    const tenLines = Array.from(
      { length: 10 },
      (_, i) => `line ${i + 1}`,
    ).join("\n");
    fs.writeFileSync(path.join(cloneDir, "src", "lib.py"), tenLines + "\n");
    git("add", "src/lib.py");
    git("commit", "--quiet", "-m", "fixture commit");
    cloneSha = git("rev-parse", "HEAD").trim();

    cloneDigest = writeDigest({
      repo: `file://${cloneDir}`,
      sha: cloneSha,
      namePart: "fixtureorg--fixturerepo",
      body:
        `\nWalks the tree ⟦src/lib.py:L1-L5⟧ and caps depth ` +
        `⟦src/lib.py:L2-L10⟧@${cloneSha.slice(0, 12)}.\n`,
    });
  });

  it("committed good fixture validates structurally (no --clone)", () => {
    const { status, stderr } = runValidator(goodFixture);
    expect(status, stderr).toBe(0);
    expect(stderr).toMatch(/quote-in-range check skipped/);
  });

  it("good digest passes quote-in-range against the fixture clone", () => {
    const { status, stderr } = runValidator(cloneDigest, cloneDir);
    expect(status, stderr).toBe(0);
    expect(stderr).not.toMatch(/skipped/);
  });

  it("citation past end of file fails quote-in-range", () => {
    const digest = writeDigest({
      repo: `file://${cloneDir}`,
      sha: cloneSha,
      namePart: "fixtureorg--fixturerepo",
      body: "\nToo far ⟦src/lib.py:L1-L99⟧.\n",
    });
    const { status, stderr } = runValidator(digest, cloneDir);
    expect(status).toBe(1);
    expect(stderr).toMatch(/quote-in-range/);
  });

  it("citation to a path absent at the sha fails quote-in-range", () => {
    const digest = writeDigest({
      repo: `file://${cloneDir}`,
      sha: cloneSha,
      namePart: "fixtureorg--fixturerepo",
      body: "\nNo such file ⟦src/nope.py:L1-L2⟧.\n",
    });
    const { status, stderr } = runValidator(digest, cloneDir);
    expect(status).toBe(1);
    expect(stderr).toMatch(/is not a file/);
  });

  it("citation to a DIRECTORY fails quote-in-range (git show would pass trees)", () => {
    const digest = writeDigest({
      repo: `file://${cloneDir}`,
      sha: cloneSha,
      namePart: "fixtureorg--fixturerepo",
      body: "\nA directory is not quotable ⟦src:L1-L2⟧.\n",
    });
    const { status, stderr } = runValidator(digest, cloneDir);
    expect(status).toBe(1);
    expect(stderr).toMatch(/is not a file/);
  });

  it("CR-bearing blob does not inflate the line count", () => {
    // "a\rb\rc\n" is ONE newline-delimited line; splitlines()-style counting
    // would see three and pass an out-of-range citation.
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: cloneDir, encoding: "utf8" });
    fs.writeFileSync(path.join(cloneDir, "src", "cr.txt"), "a\rb\rc\n");
    git("add", "src/cr.txt");
    git("commit", "--quiet", "-m", "cr fixture");
    const crSha = git("rev-parse", "HEAD").trim();
    const digest = writeDigest({
      repo: `file://${cloneDir}`,
      sha: crSha,
      namePart: "fixtureorg--fixturerepo",
      body: "\nOut of range on logical lines ⟦src/cr.txt:L1-L3⟧.\n",
    });
    const { status, stderr } = runValidator(digest, cloneDir);
    expect(status).toBe(1);
    expect(stderr).toMatch(/exceeds file length 1/);
  });
});

// Usage and parse error paths: the exit-code contract beyond 0/1.
describe("usage + parse error paths", () => {
  it("exits 2 on usage errors", () => {
    // no args
    const noArgs = spawnSync(validator, [], { encoding: "utf8" });
    expect(noArgs.status).toBe(2);
    // nonexistent digest file
    expect(runValidator(path.join(os.tmpdir(), "no-such-digest.md")).status).toBe(2);
    // unknown option
    const unknown = spawnSync(validator, [goodFixture, "--frobnicate"], {
      encoding: "utf8",
    });
    expect(unknown.status).toBe(2);
    // --clone with a non-directory
    expect(runValidator(goodFixture, path.join(os.tmpdir(), "not-a-dir-xyz")).status).toBe(2);
  });

  it("exits 1 with a parse failure on missing or unclosed frontmatter", () => {
    const dir = path.join(tmpRoot, "parse-cases");
    fs.mkdirSync(dir, { recursive: true });
    const noFm = path.join(dir, `acme--widget@${GOOD_SHA12}.md`);
    fs.writeFileSync(noFm, "just a body, no frontmatter\n");
    let res = runValidator(noFm);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/parse:/);

    fs.writeFileSync(noFm, "---\nrepo: x\nno closing delimiter\n");
    res = runValidator(noFm);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/parse:/);
  });
});

// Identity derivation negatives: URLs that pass the frontmatter pattern but
// from which no host/org/repo identity is derivable (D28 guard clauses).
describe("identity derivation negatives", () => {
  it.each([["https://github.com/widget"], ["file:///widget"]])(
    "identity underivable from %s is a validation failure",
    (repo) => {
      const digest = writeDigest({ repo, namePart: "acme--widget" });
      const { status, stderr } = runValidator(digest);
      expect(status).toBe(1);
      expect(stderr).toMatch(/cannot derive identity/);
    },
  );
});

// ts strictness: the PyYAML-datetime branch (unquoted ts) and non-UTC offsets.
describe("ts UTC strictness", () => {
  function withRawTs(ts: string): string {
    const digest = writeDigest({});
    const text = fs
      .readFileSync(digest, "utf8")
      .replace(/ts: .*/, `ts: ${ts}`); // unquoted — PyYAML parses to datetime
    fs.writeFileSync(digest, text);
    return digest;
  }

  it("unquoted UTC ts passes via the datetime branch", () => {
    const { status, stderr } = runValidator(withRawTs("2026-06-10T18:04:00Z"));
    expect(status, stderr).toBe(0);
  });

  it.each([["2026-06-10T18:04:00+02:00"], ["2026-06-10T18:04:00"]])(
    "non-UTC or naive ts %s is rejected",
    (ts) => {
      const { status, stderr } = runValidator(withRawTs(ts));
      expect(status).toBe(1);
      expect(stderr).toMatch(/'ts'/);
    },
  );
});

// Gate 3 — known-BAD committed fixture rejected: missing required fields and
// malformed commands items.
describe("gate 3: known-bad fixture", () => {
  it("is rejected with each missing/malformed field reported", () => {
    const { status, stderr } = runValidator(badFixture);
    expect(status).toBe(1);
    // every schema-required field that the fixture omits is reported
    for (const field of ["env", "ts", "dependency_kind", "truth_grade"]) {
      expect(Object.keys(required)).toContain(field);
      expect(stderr).toMatch(new RegExp(`'${field}'`));
    }
    // malformed commands items: one missing exit_code, one missing cmd
    expect(stderr).toMatch(/commands\[0\].*exit_code/);
    expect(stderr).toMatch(/commands\[1\].*cmd/);
  });
});

// Gate 4 — citation grammar v1.1 negatives (D24): each malformed token is a
// validation failure, not prose (token-totality / range rule).
describe("gate 4: grammar v1.1 negatives", () => {
  const negatives: Array<[string, string]> = [
    ["8-hex suffix", "⟦src/widget.py:L1-L5⟧@deadbeef"],
    ["17-hex suffix", "⟦src/widget.py:L1-L5⟧@0123456789abcdef0"],
    ["reversed range L90-L10", "⟦src/widget.py:L90-L10⟧"],
    ["L0 start", "⟦src/widget.py:L0-L5⟧"],
  ];

  it("the schema token_pattern is pinned at grammar version 1.1", () => {
    expect(schema.body.citation_grammar.version).toBe("1.1");
    expect(typeof schema.body.citation_grammar.token_pattern).toBe("string");
  });

  it.each(negatives)("%s is rejected", (_label, token) => {
    const digest = writeDigest({ body: `\nA claim ${token} here.\n` });
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/citation/);
  });
});

// Gate 5 — explicit @sha12 suffix that differs from the frontmatter sha12 is
// rejected (suffix-equals-sha, D24).
describe("gate 5: suffix-equals-sha", () => {
  it("well-formed @sha12 != frontmatter sha[0:12] is rejected", () => {
    const digest = writeDigest({
      body: "\nA claim ⟦src/widget.py:L1-L5⟧@ffffffffffff.\n",
    });
    expect(GOOD_SHA12).not.toBe("ffffffffffff");
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/suffix-equals-sha/);
  });
});

// Gate 6 — repo pattern from the schema: file:// and ssh:// accepted,
// garbage rejected.
describe("gate 6: repo URL pattern", () => {
  const repoPattern = new RegExp(required.repo.pattern);

  it("schema pattern accepts file:// and ssh://, rejects garbage", () => {
    expect(repoPattern.test("file:///opt/fixtures/acme/widget.git")).toBe(true);
    expect(repoPattern.test("ssh://git@github.com/acme/widget.git")).toBe(true);
    expect(repoPattern.test("ftp://x")).toBe(false);
    expect(repoPattern.test("not-a-url")).toBe(false);
  });

  it("ssh:// repo URL validates", () => {
    const digest = writeDigest({
      repo: "ssh://git@github.com/acme/widget.git",
    });
    const { status, stderr } = runValidator(digest);
    expect(status, stderr).toBe(0);
  });

  it("scp-style git@ spelling normalizes to the same identity", () => {
    const digest = writeDigest({ repo: "git@github.com:acme/widget.git" });
    const { status, stderr } = runValidator(digest);
    expect(status, stderr).toBe(0);
  });

  it.each([["ftp://x"], ["not-a-url"]])("%s is rejected", (repo) => {
    const digest = writeDigest({ repo, namePart: "acme--widget" });
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/pattern/);
  });
});

// Gate 7 — truth_grade is REQUIRED (D26).
describe("gate 7: truth_grade required", () => {
  it("digest without truth_grade is rejected", () => {
    expect(Object.keys(required)).toContain("truth_grade");
    const digest = writeDigest({ omit: ["truth_grade"] });
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/truth_grade/);
  });

  it("truth_grade outside the schema enum is rejected", () => {
    const grade = "verified"; // deliberately not a schema enum value
    expect(required.truth_grade.enum).not.toContain(grade);
    const digest = writeDigest({});
    const text = fs
      .readFileSync(digest, "utf8")
      .replace(/truth_grade: .*/, `truth_grade: ${grade}`);
    fs.writeFileSync(digest, text);
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/truth_grade/);
  });
});

// Gate 8 — filename rule (D27/D28): renamed digest invalid; org--repo must
// match the identity derived from the frontmatter repo URL.
describe("gate 8: filename rule", () => {
  it("filename sha12 != sha[0:12] (renamed digest) is rejected", () => {
    const digest = writeDigest({
      filename: `acme--widget@ffffffffffff.md`,
    });
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/sha12.*does not equal frontmatter/);
  });

  it("org--repo mismatch with the frontmatter repo identity is rejected", () => {
    const digest = writeDigest({
      filename: `otherorg--widget@${GOOD_SHA12}.md`,
    });
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/normalized identity/);
  });

  it("uppercase/equivalent URL spellings normalize before comparison", () => {
    // HTTPS spelling with uppercase org and trailing .git → same identity
    const digest = writeDigest({
      repo: "https://GitHub.com/ACME/Widget.git",
      namePart: "acme--widget",
    });
    const { status, stderr } = runValidator(digest);
    expect(status, stderr).toBe(0);
  });
});
