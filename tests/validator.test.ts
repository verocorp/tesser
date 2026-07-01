// Type-A deterministic gates for scripts/validate-digest (T8, amended by
// T12: D31 host-aware digest layout, D32 venv re-exec, D34 exit-4
// environment failures, D37 grammar tightening, D38 clone identity binding).
//
// Patterns and enums are loaded from digest-schema.yaml (spec-as-data) at the
// points where they are asserted — the tests pin against the schema, not
// against copies of its values. Every spawn sets TESSER_HOME to a hermetic
// temp dir so a real ~/.tesser/venv on the dev machine never re-execs the
// validator under test.

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
// D31 layout: <host>/<org-path>/<repo>@<sha12>.md — file:// fixtures live
// under the literal `file/` host segment.
const goodFixture = path.join(
  fixturesDir,
  "file",
  "acme",
  "widget@0123456789ab.md",
);
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
let hermeticHome: string; // empty TESSER_HOME: no venv, so no re-exec
let caseCounter = 0;

function runValidator(
  digestPath: string,
  clone?: string,
  envExtra?: Record<string, string>,
) {
  const args = [digestPath, ...(clone ? ["--clone", clone] : [])];
  const res = spawnSync(validator, args, {
    encoding: "utf8",
    env: { ...process.env, TESSER_HOME: hermeticHome, ...envExtra },
  });
  if (res.error) throw res.error;
  return { status: res.status, stderr: res.stderr };
}

interface DigestOpts {
  repo?: string;
  sha?: string;
  body?: string;
  omit?: string[]; // frontmatter fields to drop
  relPath?: string; // digest path under the case dir (D31 layout)
  truthGrade?: string; // override truth_grade (default enum[0] = run)
  commands?: unknown[]; // override commands (e.g. [] for a docs-grade overview, D8)
}

// Write a digest built from a good template into a fresh temp subdir and
// return its path. Defaults produce a digest the validator accepts, at the
// D31 path github.com/acme/widget@<sha12>.md.
function writeDigest(opts: DigestOpts = {}): string {
  const sha = opts.sha ?? GOOD_SHA;
  const fm: Record<string, unknown> = {
    repo: opts.repo ?? "https://github.com/acme/widget.git",
    sha,
    env: { os: "darwin", arch: "arm64" },
    commands: opts.commands ?? [{ cmd: "make test", exit_code: 0 }],
    ts: "2026-06-10T18:04:00Z",
    // enum values come from the schema, not hardcoded copies
    dependency_kind: required.dependency_kind.enum[1],
    truth_grade: opts.truthGrade ?? required.truth_grade.enum[0],
  };
  for (const field of opts.omit ?? []) delete fm[field];
  const body =
    opts.body ?? "\nA load-bearing claim ⟦src/widget.py:L1-L5⟧.\n";
  const relPath =
    opts.relPath ?? `github.com/acme/widget@${sha.slice(0, 12)}.md`;
  const dir = path.join(tmpRoot, `case-${caseCounter++}`);
  const digestPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(digestPath), { recursive: true });
  fs.writeFileSync(digestPath, `---\n${yaml.dump(fm)}---\n${body}`);
  return digestPath;
}

/** Create a tiny git fixture repo at <parent>/<org>/<repo> with one file. */
function makeFixtureRepo(orgName: string, repoName: string) {
  const dir = path.join(tmpRoot, orgName, repoName);
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git("init", "--quiet");
  git("config", "user.email", "fixtures@tesser.invalid");
  git("config", "user.name", "tesser fixtures");
  const tenLines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join(
    "\n",
  );
  fs.writeFileSync(path.join(dir, "src", "lib.py"), tenLines + "\n");
  git("add", "src/lib.py");
  git("commit", "--quiet", "-m", "fixture commit");
  const sha = git("rev-parse", "HEAD").trim();
  return { dir, sha, git };
}

// A bin dir on a stripped PATH carrying a real python3 (so the validator's
// shebang resolves) plus whatever git shim the caller drops in. Returns the
// dir; the caller writes a `git` script into it (absent git => not-found).
function makeShimBin(name: string): string {
  const realPython = execFileSync("python3", [
    "-c",
    "import sys; print(sys.executable)",
  ], { encoding: "utf8" }).trim();
  const binDir = path.join(tmpRoot, name);
  fs.mkdirSync(binDir, { recursive: true });
  const linked = path.join(binDir, "python3");
  if (!fs.existsSync(linked)) fs.symlinkSync(realPython, linked);
  return binDir;
}

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tesser-validator-"));
  hermeticHome = fs.mkdtempSync(path.join(os.tmpdir(), "tesser-home-"));
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.rmSync(hermeticHome, { recursive: true, force: true });
});

// Gate 1 — every digest bundled in digests/ validates. The walk is RECURSIVE
// (D31: digests nest under <host>/<org-path>/) so an invalid digest can never
// hide in a subdirectory. Currently vacuous (the tree is empty until T9
// lands), and bites on every digest added.
describe("gate 1: bundled digests", () => {
  it("every digest anywhere under digests/ passes validate-digest", () => {
    const bundledDir = path.join(repoRoot, "digests");
    const files = (
      fs.readdirSync(bundledDir, { recursive: true }) as string[]
    ).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      const { status, stderr } = runValidator(path.join(bundledDir, f));
      expect(status, `digests/${f} failed validation:\n${stderr}`).toBe(0);
    }
  });

  // D52: a personal-scope / provider-anchored digest is account-specific and
  // not reproducible — it persists to ~/.tesser/ only and must never be
  // committed into the shareable bundled set. Armed now, vacuous until T9.
  it("no bundled digest is provider-anchored or scope: personal (D52)", () => {
    const bundledDir = path.join(repoRoot, "digests");
    const files = (
      fs.readdirSync(bundledDir, { recursive: true }) as string[]
    ).filter((f) => f.endsWith(".md"));
    for (const f of files) {
      const text = fs.readFileSync(path.join(bundledDir, f), "utf8");
      const m = text.match(/^---\n([\s\S]*?)\n---/);
      if (!m) continue;
      const fm = yaml.load(m[1]) as any;
      expect(fm.scope, `bundled digests/${f} must not be scope: personal (D52)`).not.toBe("personal");
      expect(fm.provider, `bundled digests/${f} must not be provider-anchored (D52)`).toBeUndefined();
    }
  });
});

// Gate 2 — known-GOOD digest validates, including quote-in-range against a
// real fixture git repo created in a temp dir (file:// URL per D25/D8).
describe("gate 2: known-good digest, with quote-in-range", () => {
  let cloneDir: string;
  let cloneSha: string;
  let cloneDigest: string;
  let cloneGit: (...args: string[]) => string;

  beforeAll(() => {
    // org/repo path segments are lowercase so the file:// identity rule
    // (org = parent dir, repo = repo dir) yields the digest path exactly.
    const fixture = makeFixtureRepo("fixtureorg", "fixturerepo");
    cloneDir = fixture.dir;
    cloneSha = fixture.sha;
    cloneGit = fixture.git;
    // Matching origin remote: identity binding (D38) runs and passes, so no
    // "skipped" note appears for the happy path.
    cloneGit("remote", "add", "origin", `file://${cloneDir}`);

    cloneDigest = writeDigest({
      repo: `file://${cloneDir}`,
      sha: cloneSha,
      relPath: `file/fixtureorg/fixturerepo@${cloneSha.slice(0, 12)}.md`,
      body:
        `\nWalks the tree ⟦src/lib.py:L1-L5⟧ and caps depth ` +
        `⟦src/lib.py:L2-L10⟧@${cloneSha.slice(0, 12)}.\n`,
    });
  });

  it("committed good fixture validates structurally (no --clone)", () => {
    const { status, stderr } = runValidator(goodFixture);
    expect(status, stderr).toBe(0);
    expect(stderr).toMatch(/clone-identity and quote-in-range checks skipped/);
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
      relPath: `file/fixtureorg/fixturerepo@${cloneSha.slice(0, 12)}.md`,
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
      relPath: `file/fixtureorg/fixturerepo@${cloneSha.slice(0, 12)}.md`,
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
      relPath: `file/fixtureorg/fixturerepo@${cloneSha.slice(0, 12)}.md`,
      body: "\nA directory is not quotable ⟦src:L1-L2⟧.\n",
    });
    const { status, stderr } = runValidator(digest, cloneDir);
    expect(status).toBe(1);
    expect(stderr).toMatch(/is not a file/);
  });

  it("CR-bearing blob does not inflate the line count", () => {
    // "a\rb\rc\n" is ONE newline-delimited line; splitlines()-style counting
    // would see three and pass an out-of-range citation.
    fs.writeFileSync(path.join(cloneDir, "src", "cr.txt"), "a\rb\rc\n");
    cloneGit("add", "src/cr.txt");
    cloneGit("commit", "--quiet", "-m", "cr fixture");
    const crSha = cloneGit("rev-parse", "HEAD").trim();
    const digest = writeDigest({
      repo: `file://${cloneDir}`,
      sha: crSha,
      relPath: `file/fixtureorg/fixturerepo@${crSha.slice(0, 12)}.md`,
      body: "\nOut of range on logical lines ⟦src/cr.txt:L1-L3⟧.\n",
    });
    const { status, stderr } = runValidator(digest, cloneDir);
    expect(status).toBe(1);
    expect(stderr).toMatch(/exceeds file length 1/);
  });
});

// Gate — clone identity binding (D38): the clone's origin remote, when it
// exists, must normalize to the frontmatter repo's identity; any directory
// with a matching commit must NOT validate any digest.
describe("clone identity binding (D38)", () => {
  it("origin remote pointing at a different repo is INVALID", () => {
    const fixture = makeFixtureRepo("d38org", "d38mismatch");
    fixture.git("remote", "add", "origin", "https://github.com/other/thing.git");
    const digest = writeDigest({
      repo: `file://${fixture.dir}`,
      sha: fixture.sha,
      relPath: `file/d38org/d38mismatch@${fixture.sha.slice(0, 12)}.md`,
      body: "\nA claim ⟦src/lib.py:L1-L5⟧.\n",
    });
    const { status, stderr } = runValidator(digest, fixture.dir);
    expect(status).toBe(1);
    expect(stderr).toMatch(/clone-identity/);
    // The message names both identities.
    expect(stderr).toMatch(/other\/thing/);
    expect(stderr).toMatch(/d38org\/d38mismatch/);
  });

  it("remoteless clone (hermetic fixture) skips the binding with a note and stays valid", () => {
    const fixture = makeFixtureRepo("d38org", "d38remoteless");
    const digest = writeDigest({
      repo: `file://${fixture.dir}`,
      sha: fixture.sha,
      relPath: `file/d38org/d38remoteless@${fixture.sha.slice(0, 12)}.md`,
      body: "\nA claim ⟦src/lib.py:L1-L5⟧.\n",
    });
    const { status, stderr } = runValidator(digest, fixture.dir);
    expect(status, stderr).toBe(0);
    expect(stderr).toMatch(/no origin remote.*identity binding skipped/);
  });

  it("origin URL with no derivable identity skips the binding with a note and stays valid", () => {
    const fixture = makeFixtureRepo("d38org", "d38underivable");
    fixture.git("remote", "add", "origin", "not-a-url");
    const digest = writeDigest({
      repo: `file://${fixture.dir}`,
      sha: fixture.sha,
      relPath: `file/d38org/d38underivable@${fixture.sha.slice(0, 12)}.md`,
      body: "\nA claim ⟦src/lib.py:L1-L5⟧.\n",
    });
    const { status, stderr } = runValidator(digest, fixture.dir);
    expect(status, stderr).toBe(0);
    expect(stderr).toMatch(/no identity derivable.*identity binding skipped/);
  });
});

// Usage and parse error paths: the exit-code contract beyond 0/1.
describe("usage + parse error paths", () => {
  it("exits 2 on usage errors", () => {
    // no args
    const noArgs = spawnSync(validator, [], {
      encoding: "utf8",
      env: { ...process.env, TESSER_HOME: hermeticHome },
    });
    expect(noArgs.status).toBe(2);
    // nonexistent digest file
    expect(runValidator(path.join(os.tmpdir(), "no-such-digest.md")).status).toBe(2);
    // unknown option
    const unknown = spawnSync(validator, [goodFixture, "--frobnicate"], {
      encoding: "utf8",
      env: { ...process.env, TESSER_HOME: hermeticHome },
    });
    expect(unknown.status).toBe(2);
    // --clone with a non-directory
    expect(runValidator(goodFixture, path.join(os.tmpdir(), "not-a-dir-xyz")).status).toBe(2);
  });

  it("exits 1 with a parse failure on missing or unclosed frontmatter", () => {
    const dir = path.join(tmpRoot, "parse-cases");
    fs.mkdirSync(dir, { recursive: true });
    const noFm = path.join(dir, `widget@${GOOD_SHA12}.md`);
    fs.writeFileSync(noFm, "just a body, no frontmatter\n");
    let res = runValidator(noFm);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/parse:/);

    fs.writeFileSync(noFm, "---\nrepo: x\nno closing delimiter\n");
    res = runValidator(noFm);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/parse:/);
  });

  it("a non-UTF-8 digest is INVALID (exit 1) — a property of the digest, not the environment (D34)", () => {
    const dir = path.join(tmpRoot, "non-utf8");
    fs.mkdirSync(dir, { recursive: true });
    const digest = path.join(dir, `widget@${GOOD_SHA12}.md`);
    fs.writeFileSync(digest, Buffer.from([0x2d, 0x2d, 0x2d, 0x0a, 0xff, 0xfe, 0x0a]));
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/not valid UTF-8/);
  });

  it("a BOM-prefixed digest validates (utf-8-sig), not a misleading delimiter error", () => {
    const digest = writeDigest({});
    const text = fs.readFileSync(digest, "utf8");
    fs.writeFileSync(digest, "﻿" + text); // editor-emitted BOM
    const { status, stderr } = runValidator(digest);
    expect(status, stderr).toBe(0);
  });

  it("a frontmatter over the size cap is INVALID before parsing (alias-bomb guard)", () => {
    const digest = writeDigest({});
    const text = fs.readFileSync(digest, "utf8");
    // Inject a giant comment line inside the frontmatter block.
    const bloated = text.replace(
      /^---\n/,
      "---\n# " + "x".repeat(70 * 1024) + "\n",
    );
    fs.writeFileSync(digest, bloated);
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/frontmatter exceeds/);
  });
});

// Environment failures (D34): exit 4, distinct from invalid — a transient
// infra problem must never discard a cold run's digest.
describe("environment failures exit 4 (D34)", () => {
  it("git missing from PATH with --clone is exit 4, not invalid", () => {
    // A PATH with python3 but no git: the shebang still resolves, the git
    // subprocess does not.
    const binDir = makeShimBin("gitless-bin");
    const digest = writeDigest({});
    const cloneStandIn = path.dirname(digest); // any directory: git never runs
    const { status, stderr } = runValidator(digest, cloneStandIn, {
      PATH: binDir,
    });
    expect(status, stderr).toBe(4);
    expect(stderr).toMatch(/ENVIRONMENT/);
    expect(stderr).toMatch(/git executable not found/);
  });

  it("git subprocess timeout is exit 4, not invalid", () => {
    // PATH carries python3 plus a git that hangs past the (test-shrunk)
    // bound. TESSER_VALIDATE_GIT_TIMEOUT is the tests-only override, same
    // posture as TESSER_HOME.
    const binDir = makeShimBin("hanging-git-bin");
    // Absolute /bin/sleep: the stripped PATH has no coreutils.
    fs.writeFileSync(path.join(binDir, "git"), "#!/bin/sh\n/bin/sleep 5\n", {
      mode: 0o755,
    });
    const digest = writeDigest({});
    const { status, stderr } = runValidator(digest, path.dirname(digest), {
      PATH: binDir,
      TESSER_VALIDATE_GIT_TIMEOUT: "0.5",
    });
    expect(status, stderr).toBe(4);
    expect(stderr).toMatch(/ENVIRONMENT/);
    expect(stderr).toMatch(/timed out/);
  });

  it("a clone that lacks the digest's commit is exit 4, not invalid (D34)", () => {
    // The digest is valid; the clone (a real git repo) simply does not
    // contain the pinned commit — a property of the clone, not the digest.
    // Without the sha-resolution guard every citation would read INVALID and
    // the playbook would discard a good digest.
    const fixture = makeFixtureRepo("d34org", "d34missingcommit");
    const absentSha = "0123456789abcdef0123456789abcdef01234567";
    const digest = writeDigest({
      repo: `file://${fixture.dir}`,
      sha: absentSha,
      relPath: `file/d34org/d34missingcommit@${absentSha.slice(0, 12)}.md`,
      body: "\nA claim ⟦src/lib.py:L1-L5⟧.\n",
    });
    const { status, stderr } = runValidator(digest, fixture.dir);
    expect(status, stderr).toBe(4);
    expect(stderr).toMatch(/ENVIRONMENT/);
    expect(stderr).toMatch(/does not contain commit/);
  });

  it("a confirmed INVALID finding wins over an environment failure: exit 1, not 4", () => {
    // Both lists populate at once: a grammar-invalid citation (reversed
    // range) is provably bad, while git is missing from PATH. INVALID must
    // win — the digest is bad regardless of the environment.
    const binDir = makeShimBin("precedence-bin");
    const digest = writeDigest({
      body: "\nBad range ⟦src/widget.py:L90-L10⟧.\n",
    });
    const { status, stderr } = runValidator(digest, path.dirname(digest), {
      PATH: binDir,
    });
    expect(status, stderr).toBe(1);
    expect(stderr).toMatch(/INVALID:/);
    expect(stderr).toMatch(/ENVIRONMENT:/);
  });

  it("unreadable digest-schema.yaml is exit 4 (broken skill checkout)", () => {
    // Copy the validator into a root with no digest-schema.yaml next to it.
    const brokenRoot = path.join(tmpRoot, "broken-checkout");
    fs.mkdirSync(path.join(brokenRoot, "scripts"), { recursive: true });
    const copied = path.join(brokenRoot, "scripts", "validate-digest");
    fs.copyFileSync(validator, copied);
    fs.chmodSync(copied, 0o755);
    const res = spawnSync(copied, [goodFixture], {
      encoding: "utf8",
      env: { ...process.env, TESSER_HOME: hermeticHome },
    });
    expect(res.status, res.stderr).toBe(4);
    expect(res.stderr).toMatch(/ENVIRONMENT/);
    expect(res.stderr).toMatch(/digest-schema\.yaml/);
  });
});

// Venv re-exec (D32): the validator hands itself to the setup-created venv
// python BEFORE importing yaml; without a venv, the missing-PyYAML backstop
// names the setup step.
describe("venv re-exec + setup backstop (D32)", () => {
  it("re-execs into TESSER_HOME/venv/bin/python3 before importing yaml", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "tesser-reexec-"));
    fs.mkdirSync(path.join(home, "venv", "bin"), { recursive: true });
    const record = path.join(home, "exec-record");
    // A python3 shim that records its argv and exits 7: if the validator
    // reaches this exit code, it re-execed before any yaml import could run.
    fs.writeFileSync(
      path.join(home, "venv", "bin", "python3"),
      `#!/bin/sh\nprintf '%s\\n' "$*" > "${record}"\nexit 7\n`,
      { mode: 0o755 },
    );
    const digest = writeDigest({});
    const res = spawnSync(validator, [digest], {
      encoding: "utf8",
      env: { ...process.env, TESSER_HOME: home },
    });
    expect(res.status).toBe(7);
    const recorded = fs.readFileSync(record, "utf8");
    expect(recorded).toContain("validate-digest"); // the script re-invoked
    expect(recorded).toContain(digest); // argv passed through
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("exit 3 when PyYAML is missing and no venv exists; the message names scripts/setup", () => {
    // Shadow the real yaml package with one that fails to import — this is
    // exactly what a PyYAML-free system python looks like to the validator.
    const fakeSite = path.join(tmpRoot, "fake-site");
    fs.mkdirSync(fakeSite, { recursive: true });
    fs.writeFileSync(
      path.join(fakeSite, "yaml.py"),
      "raise ImportError('PyYAML deliberately absent for this gate')\n",
    );
    const digest = writeDigest({});
    const { status, stderr } = runValidator(digest, undefined, {
      PYTHONPATH: fakeSite,
    });
    expect(status).toBe(3);
    expect(stderr).toMatch(/scripts\/setup/);
  });
});

// Identity derivation negatives: URLs that pass the frontmatter pattern but
// from which no identity is derivable (D31 guard clauses).
describe("identity derivation negatives", () => {
  it.each([["https://github.com/widget"], ["file:///widget"]])(
    "identity underivable from %s is a validation failure",
    (repo) => {
      const digest = writeDigest({ repo });
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

// Gate 4 — citation grammar v1.1 negatives (D24, tightened by D37): each
// malformed token is a validation failure, not prose (token-totality /
// range rule / path-normality).
describe("gate 4: grammar v1.1 negatives", () => {
  const negatives: Array<[string, string]> = [
    ["8-hex suffix", "⟦src/widget.py:L1-L5⟧@deadbeef"],
    ["17-hex suffix", "⟦src/widget.py:L1-L5⟧@0123456789abcdef0"],
    ["reversed range L90-L10", "⟦src/widget.py:L90-L10⟧"],
    ["L0 start", "⟦src/widget.py:L0-L5⟧"],
    // D37 charset: a stray ⟦ can no longer merge into the next citation's
    // path and pass as one structurally-valid token.
    ["stray-⟦ merge", "⟦⟦src/widget.py:L1-L5⟧"],
    ["newline in path", "⟦src/wid\nget.py:L1-L5⟧"],
    // D37 path-normality: traversal and absolute paths fail at the grammar
    // stage, before any git resolution.
    ["../ traversal", "⟦../../etc/passwd:L1-L2⟧"],
    ["absolute path", "⟦/etc/passwd:L1-L2⟧"],
    ["'.' segment", "⟦src/./widget.py:L1-L5⟧"],
    // A control char (NUL) passes the schema charset but must be a clean
    // INVALID, never an embedded-null crash in the git subprocess.
    ["NUL in path", "⟦src/wid\x00get.py:L1-L5⟧"],
    ["tab in path", "⟦src/wid\tget.py:L1-L5⟧"],
  ];

  it("the schema token_pattern is pinned at grammar version 1.1", () => {
    expect(schema.body.citation_grammar.version).toBe("1.1");
    expect(typeof schema.body.citation_grammar.token_pattern).toBe("string");
  });

  it("the schema token_pattern path charset excludes ⟦ and newlines (D37)", () => {
    const tokenRe = new RegExp(`^(?:${schema.body.citation_grammar.token_pattern})$`);
    expect(tokenRe.test("⟦src/widget.py:L1-L5⟧")).toBe(true);
    expect(tokenRe.test("⟦sr⟦c.py:L1-L5⟧")).toBe(false);
    expect(tokenRe.test("⟦src/wid\nget.py:L1-L5⟧")).toBe(false);
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
    const digest = writeDigest({ repo });
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

// Gate 8 — digest path rule (D27/D31): the path ends with
// <host>/<org-path>/<repo>@<sha12>.md; a renamed OR re-homed digest is
// invalid; the full namespace path is preserved (GitLab subgroups).
describe("gate 8: digest path rule (D27/D31)", () => {
  it("path sha12 != sha[0:12] (renamed digest) is rejected", () => {
    const digest = writeDigest({
      relPath: `github.com/acme/widget@ffffffffffff.md`,
    });
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/sha12.*does not equal frontmatter/);
  });

  it("wrong org directory (re-homed digest) is rejected", () => {
    const digest = writeDigest({
      relPath: `github.com/otherorg/widget@${GOOD_SHA12}.md`,
    });
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/normalized identity path/);
  });

  it("the old flat <org>--<repo>@<sha12>.md name is rejected (host-aware layout, D31)", () => {
    const digest = writeDigest({
      relPath: `acme--widget@${GOOD_SHA12}.md`,
    });
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/D31/);
  });

  it("missing host directory is rejected — same org/repo on different hosts must not collide", () => {
    const digest = writeDigest({
      relPath: `acme/widget@${GOOD_SHA12}.md`,
    });
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/normalized identity path/);
  });

  it("GitLab subgroup identity round-trips with ALL namespace segments preserved", () => {
    const digest = writeDigest({
      repo: "https://gitlab.com/group/subgroup/repo.git",
      relPath: `gitlab.com/group/subgroup/repo@${GOOD_SHA12}.md`,
    });
    const { status, stderr } = runValidator(digest);
    expect(status, stderr).toBe(0);
  });

  it("a subgroup digest with the namespace truncated to two segments is rejected", () => {
    const digest = writeDigest({
      repo: "https://gitlab.com/group/subgroup/repo.git",
      relPath: `gitlab.com/subgroup/repo@${GOOD_SHA12}.md`,
    });
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/normalized identity path/);
  });

  it("uppercase/equivalent URL spellings normalize before comparison", () => {
    // HTTPS spelling with uppercase org and trailing .git → same identity
    const digest = writeDigest({
      repo: "https://GitHub.com/ACME/Widget.git",
      relPath: `github.com/acme/widget@${GOOD_SHA12}.md`,
    });
    const { status, stderr } = runValidator(digest);
    expect(status, stderr).toBe(0);
  });
});

// D8 (claim-cache): an overview persists at docs grade with NO commands, and a
// claim fused/persisted from training is tagged ⟦recall⟧ (no path/sha, exempt from
// quote-in-range). These unblock CC-T4 (overview-persist) and CC-T2 (consult).
describe("D8: docs-grade commands-optional + recall provenance (claim-cache)", () => {
  let cloneDir: string;
  let cloneSha: string;

  beforeAll(() => {
    cloneDir = path.join(tmpRoot, "d8org", "d8repo");
    fs.mkdirSync(cloneDir, { recursive: true });
    const git = (...a: string[]) =>
      execFileSync("git", a, { cwd: cloneDir, encoding: "utf8" });
    git("init", "--quiet");
    git("config", "user.email", "fixtures@tesser.invalid");
    git("config", "user.name", "tesser fixtures");
    const readme = Array.from({ length: 8 }, (_, i) => `readme line ${i + 1}`).join("\n");
    fs.writeFileSync(path.join(cloneDir, "README.md"), readme + "\n");
    git("add", "README.md");
    git("commit", "--quiet", "-m", "init");
    git("remote", "add", "origin", `file://${cloneDir}`);
    cloneSha = git("rev-parse", "HEAD").trim();
  });

  function d8Digest(opts: Partial<DigestOpts>): string {
    return writeDigest({
      repo: `file://${cloneDir}`,
      sha: cloneSha,
      relPath: `file/d8org/d8repo@${cloneSha.slice(0, 12)}.md`,
      ...opts,
    });
  }

  it("a docs-grade overview may have EMPTY commands (it ran none); README citation holds", () => {
    const digest = d8Digest({
      truthGrade: "docs",
      commands: [],
      body: "\nOverview, going by its README ⟦README.md:L1-L3⟧.\n",
    });
    const { status, stderr } = runValidator(digest, cloneDir);
    expect(status, stderr).toBe(0);
  });

  it("below docs grade, empty commands is still INVALID (an inspect/run claim must show its work)", () => {
    const digest = d8Digest({
      truthGrade: "run",
      commands: [],
      body: "\nA run claim ⟦README.md:L1-L2⟧.\n",
    });
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/at least 1 item/);
  });

  it("⟦recall⟧ is a valid token, exempt from quote-in-range (no path/sha to check)", () => {
    const digest = d8Digest({
      truthGrade: "docs",
      commands: [],
      body: "\nFrom training, not yet verified against source ⟦recall⟧.\n",
    });
    const { status, stderr } = runValidator(digest, cloneDir);
    expect(status, stderr).toBe(0);
    expect(stderr).not.toMatch(/is not a file|quote-in-range/);
  });

  it("a recall claim mixed with a real README citation validates against the clone", () => {
    const digest = d8Digest({
      truthGrade: "docs",
      commands: [],
      body: "\nRecalled ⟦recall⟧; and the README says ⟦README.md:L2-L4⟧.\n",
    });
    const { status, stderr } = runValidator(digest, cloneDir);
    expect(status, stderr).toBe(0);
  });

  it("⟦recall⟧ takes no sha suffix — ⟦recall⟧@<hex> is a malformed token (token-totality)", () => {
    const digest = d8Digest({
      truthGrade: "docs",
      commands: [],
      body: `\nMislabeled ⟦recall⟧@${cloneSha.slice(0, 12)}.\n`,
    });
    const { status, stderr } = runValidator(digest);
    expect(status).toBe(1);
    expect(stderr).toMatch(/malformed token/);
  });
});

// CC-T7 — `--persist`: validate-digest owns the atomic move to digests/, computing
// the target from the frontmatter identity+sha (NOT the staged location). Fixes the
// river/cobra dogfood bug where agents hand-built the digests/ path inconsistently.
describe("CC-T7: validate-digest --persist (deterministic atomic move)", () => {
  let cloneDir: string;
  let cloneSha: string;

  beforeAll(() => {
    cloneDir = path.join(tmpRoot, "t7org", "t7repo");
    fs.mkdirSync(cloneDir, { recursive: true });
    const git = (...a: string[]) =>
      execFileSync("git", a, { cwd: cloneDir, encoding: "utf8" });
    git("init", "--quiet");
    git("config", "user.email", "f@t.invalid");
    git("config", "user.name", "f");
    fs.writeFileSync(path.join(cloneDir, "README.md"),
      Array.from({ length: 6 }, (_, i) => `readme ${i + 1}`).join("\n") + "\n");
    git("add", "README.md");
    git("commit", "--quiet", "-m", "init");
    git("remote", "add", "origin", `file://${cloneDir}`);
    cloneSha = git("rev-parse", "HEAD").trim();
  });

  // Write a digest to an ARBITRARY staged path (the point: location is irrelevant).
  function stage(rel: string, body: string, grade = "docs", commands: unknown[] = []): string {
    const fm = {
      repo: `file://${cloneDir}`,
      sha: cloneSha,
      env: { os: "darwin", arch: "arm64" },
      commands,
      ts: "2026-06-10T18:04:00Z",
      dependency_kind: required.dependency_kind.enum[1],
      truth_grade: grade,
    };
    const p = path.join(tmpRoot, `t7-${caseCounter++}`, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, `---\n${yaml.dump(fm)}---\n${body}`);
    return p;
  }
  function persistRun(staged: string) {
    const res = spawnSync(validator, [staged, "--clone", cloneDir, "--persist"], {
      encoding: "utf8",
      env: { ...process.env, TESSER_HOME: hermeticHome },
    });
    let json: any = null;
    try { json = JSON.parse(res.stdout); } catch { /* */ }
    return { status: res.status, json, stdout: res.stdout, stderr: res.stderr };
  }
  const target = () =>
    path.join(hermeticHome, "digests", "file", "t7org", `t7repo@${cloneSha.slice(0, 12)}.md`);

  it("moves a validated digest to the COMPUTED path regardless of where it was staged", () => {
    const staged = stage(path.join("junk", "deep", "whatever-name.md"),
      "Overview, going by its README ⟦README.md:L1-L2⟧.");
    const r = persistRun(staged);
    expect(r.status, r.stderr).toBe(0);
    expect(r.json.status).toBe("persisted");
    expect(r.json.persisted).toBe(target());
    expect(fs.existsSync(target())).toBe(true);
    expect(r.json.digest_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(staged)).toBe(false); // staged file consumed by the move
  });

  it("first-writer-wins: a present target is not clobbered (Codex #11)", () => {
    fs.rmSync(target(), { force: true });
    const first = persistRun(stage("a/one.md", "First ⟦README.md:L1-L2⟧."));
    expect(first.json.status).toBe("persisted");
    const firstBytes = fs.readFileSync(target(), "utf8");
    const second = persistRun(stage("b/two.md", "Second DIFFERENT ⟦README.md:L3-L4⟧."));
    expect(second.status).toBe(0);
    expect(second.json.status).toBe("already-present");
    expect(fs.readFileSync(target(), "utf8")).toBe(firstBytes); // original kept
  });

  it("does NOT persist an INVALID digest (out-of-range citation) — exit 1, no move", () => {
    fs.rmSync(target(), { force: true });
    const staged = stage("c/bad.md", "Out of range ⟦README.md:L1-L999⟧.");
    const r = persistRun(staged);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/quote-in-range/);
    expect(fs.existsSync(target())).toBe(false); // nothing persisted
    expect(fs.existsSync(staged)).toBe(true); // staged file left for the agent to fix
  });

  it("an inspect-grade digest (read source, read commands listed) persists too", () => {
    fs.rmSync(target(), { force: true });
    const staged = stage("d/inspect.md",
      "Read the README ⟦README.md:L2-L4⟧.", "inspect",
      [{ cmd: "grep -n foo README.md", exit_code: 0 }]);
    const r = persistRun(staged);
    expect(r.status, r.stderr).toBe(0);
    expect(r.json.status).toBe("persisted");
  });
});

// D50/D51/D52 — provider-anchored digests (a hosted closed service: no clone
// URL, no commit). The default `required` block stays repo-anchored; a digest
// is provider-anchored when provider/observed_at appear.
describe("provider-anchored digests (D50/D51/D52)", () => {
  const OBSERVED_AT = "2026-06-23T22:30:00Z";
  const YMD = "20260623";

  function writeProviderDigest(opts: {
    provider?: string;
    truthGrade?: string;
    scope?: string | null; // null = omit
    reproducible?: boolean | null; // null = omit
    body?: string;
    relPath?: string;
    extra?: Record<string, unknown>;
    omit?: string[];
  } = {}): string {
    const provider = opts.provider ?? "clickhouse/cloud";
    const fm: Record<string, unknown> = {
      provider,
      observed_at: OBSERVED_AT,
      env: { os: "darwin", arch: "arm64" },
      commands: [{ cmd: "curl -s usageCost", exit_code: 0 }],
      ts: "2026-06-23T22:35:00Z",
      dependency_kind: "hosted-closed",
      truth_grade: opts.truthGrade ?? "run",
      scope: "personal",
      reproducible: false,
      ...(opts.extra ?? {}),
    };
    if (opts.scope !== undefined) {
      if (opts.scope === null) delete fm.scope;
      else fm.scope = opts.scope;
    }
    if (opts.reproducible !== undefined) {
      if (opts.reproducible === null) delete fm.reproducible;
      else fm.reproducible = opts.reproducible;
    }
    for (const field of opts.omit ?? []) delete fm[field];
    const body = opts.body ?? "\n1 CHC = $1 USD ⟦observed⟧.\n";
    const relPath = opts.relPath ?? `provider/${provider}@${YMD}.md`;
    const dir = path.join(tmpRoot, `pcase-${caseCounter++}`);
    const digestPath = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(digestPath), { recursive: true });
    fs.writeFileSync(digestPath, `---\n${yaml.dump(fm)}---\n${body}`);
    return digestPath;
  }

  it("a valid provider-anchored run-grade digest passes (no --clone)", () => {
    const { status, stderr } = runValidator(writeProviderDigest());
    expect(status, stderr).toBe(0);
  });

  it("repo/sha are forbidden on a provider-anchored digest (D50)", () => {
    const d = writeProviderDigest({ extra: { repo: "https://github.com/x/y", sha: GOOD_SHA } });
    const { status, stderr } = runValidator(d);
    expect(status).toBe(1);
    expect(stderr).toMatch(/must be absent on a provider-anchored/);
  });

  it("a missing provider field (observed_at alone) is INVALID (D50)", () => {
    const { status, stderr } = runValidator(writeProviderDigest({ omit: ["provider"] }));
    expect(status).toBe(1);
    expect(stderr).toMatch(/missing required field 'provider'/);
  });

  it("scope must be personal and reproducible false (D52)", () => {
    expect(runValidator(writeProviderDigest({ scope: "shareable" })).status).toBe(1);
    expect(runValidator(writeProviderDigest({ reproducible: true })).status).toBe(1);
    expect(runValidator(writeProviderDigest({ scope: null })).status).toBe(1);
  });

  it("a run-grade provider digest with no ⟦observed⟧ claim is INVALID (D51)", () => {
    const d = writeProviderDigest({ body: "\nNo observation here, just prose.\n" });
    const { status, stderr } = runValidator(d);
    expect(status).toBe(1);
    expect(stderr).toMatch(/at least one ⟦observed⟧/);
  });

  it("a docs-grade provider digest does NOT require ⟦observed⟧", () => {
    const d = writeProviderDigest({ truthGrade: "docs", body: "\nFrom the vendor docs.\n" });
    const { status, stderr } = runValidator(d);
    expect(status, stderr).toBe(0);
  });

  it("⟦observed⟧@<hex> is malformed, not split (token-totality, D51)", () => {
    const d = writeProviderDigest({ body: "\nBad ⟦observed⟧@deadbeefcafe marker.\n" });
    const { status, stderr } = runValidator(d);
    expect(status).toBe(1);
    expect(stderr).toMatch(/malformed token/);
  });

  it("a file citation in a provider digest is INVALID — nothing to verify it against (finding #1/D51)", () => {
    // Has a valid ⟦observed⟧ (so the run-grade rule is satisfied); the file
    // citation must still be rejected — a provider digest has no clone/sha, so
    // quote-in-range and suffix-equals-sha can't check it (no-laundering hole).
    const d = writeProviderDigest({
      body: "\n1 CHC = $1 ⟦observed⟧. Billing at ⟦internal/billing.go:L1-L9⟧@deadbeefcafe.\n",
    });
    const { status, stderr } = runValidator(d);
    expect(status).toBe(1);
    expect(stderr).toMatch(/not allowed in a provider-anchored digest/);
  });

  it("the digest path must be provider/<vendor>/<service>@<YYYYMMDD>.md (D50)", () => {
    const d = writeProviderDigest({ relPath: "provider/clickhouse/wrongname@20260623.md" });
    const { status, stderr } = runValidator(d);
    expect(status).toBe(1);
    expect(stderr).toMatch(/provider-anchored digest must sit at a path ending/);
  });

  it("clone checks are inapplicable-by-kind (not errors) with --clone (D50)", () => {
    const repo = makeFixtureRepo("acme", "widget-prov");
    const { status, stderr } = runValidator(writeProviderDigest(), repo.dir);
    expect(status, stderr).toBe(0);
    expect(stderr).toMatch(/inapplicable to a provider-anchored digest/);
  });

  it("--persist lands a provider digest at provider/<vendor>/<service>@<YYYYMMDD>.md", () => {
    const staged = path.join(tmpRoot, `pstage-${caseCounter++}.md`);
    const src = writeProviderDigest();
    fs.copyFileSync(src, staged);
    const res = spawnSync(validator, [staged, "--persist"], {
      encoding: "utf8",
      env: { ...process.env, TESSER_HOME: hermeticHome },
    });
    expect(res.status, res.stderr).toBe(0);
    const json = JSON.parse(res.stdout);
    const expected = path.join(
      hermeticHome, "digests", "provider", "clickhouse", `cloud@${YMD}.md`,
    );
    expect(json.persisted).toBe(expected);
    expect(fs.existsSync(expected)).toBe(true);
    expect(json.digest_sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("scripts/finalize (D53) — the manual persist orchestrator", () => {
  const finalizeScript = path.join(repoRoot, "scripts", "finalize");
  const OBS = "2026-06-23T22:35:00Z";
  let finCounter = 0;

  function stageProviderDigest(
    overrides: Record<string, unknown> = {},
    body = "\n1 CHC = $1 USD ⟦observed⟧.\n",
  ): string {
    const fm: Record<string, unknown> = {
      provider: "clickhouse/cloud",
      observed_at: OBS,
      env: { os: "darwin", arch: "arm64" },
      commands: [{ cmd: "curl -s usageCost", exit_code: 0 }],
      ts: OBS,
      dependency_kind: "hosted-closed",
      truth_grade: "run",
      scope: "personal",
      reproducible: false,
      ...overrides,
    };
    const dir = path.join(tmpRoot, `finstage-${finCounter++}`);
    fs.mkdirSync(dir, { recursive: true });
    const p = path.join(dir, "staged.md");
    fs.writeFileSync(p, `---\n${yaml.dump(fm)}---\n${body}`);
    return p;
  }

  function runFinalize(args: string[], home?: string) {
    const h = home ?? fs.mkdtempSync(path.join(tmpRoot, "finhome-"));
    const res = spawnSync(finalizeScript, args, {
      encoding: "utf8",
      env: { ...process.env, TESSER_HOME: h },
    });
    if (res.error) throw res.error;
    return { status: res.status, stdout: res.stdout, stderr: res.stderr, home: h };
  }

  it("persists a provider digest and writes a finalized log record in one call", () => {
    const staged = stageProviderDigest();
    const { status, stdout, stderr, home } = runFinalize([
      "--digest", staged, "--question", "clickhouse billing?",
      "--dependency-kind", "hosted-closed", "--provider", "clickhouse/cloud",
      "--credentialed",
    ]);
    expect(status, stderr).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.digest_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(out.log_id).toBeTruthy();
    expect(fs.existsSync(out.persisted)).toBe(true);
    const log = fs.readFileSync(path.join(home, "log.jsonl"), "utf8");
    expect(log).toMatch(/finalized/);
    expect(log).toMatch(/clickhouse\/cloud/);
  });

  it("rejects repo flags on a provider-anchored digest (anchor cross-check, finding #3)", () => {
    const staged = stageProviderDigest();
    const { status, stderr } = runFinalize([
      "--digest", staged, "--question", "q", "--dependency-kind", "hosted-closed",
      "--repo", "https://github.com/x/y", "--sha", GOOD_SHA,
    ]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/provider-anchored/);
  });

  it("rejects --provider on a repo-anchored digest (anchor cross-check, finding #3)", () => {
    const { status, stderr } = runFinalize([
      "--digest", goodFixture, "--question", "q",
      "--dependency-kind", "clonable-library", "--provider", "x/y",
    ]);
    expect(status).toBe(2);
    expect(stderr).toMatch(/repo-anchored/);
  });

  it("refuses a same-day re-observation with different content — no silent drop, no lying log (finding #1/D50)", () => {
    const home = fs.mkdtempSync(path.join(tmpRoot, "finhome-conflict-"));
    const a = stageProviderDigest({}, "\n1 CHC = $1 USD ⟦observed⟧.\n");
    const first = runFinalize([
      "--digest", a, "--question", "q", "--dependency-kind", "hosted-closed",
      "--provider", "clickhouse/cloud",
    ], home);
    expect(first.status, first.stderr).toBe(0);

    const b = stageProviderDigest({}, "\nStorage is $0.02 per GB-month ⟦observed⟧.\n");
    const second = runFinalize([
      "--digest", b, "--question", "q", "--dependency-kind", "hosted-closed",
      "--provider", "clickhouse/cloud",
    ], home);
    expect(second.status).toBe(1);
    expect(second.stderr).toMatch(/refusing to overwrite/);
    // the staged second digest is left untouched (not consumed by the failed move)
    expect(fs.existsSync(b)).toBe(true);
  });
});
