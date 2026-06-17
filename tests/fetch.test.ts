// Type-C deterministic gates for scripts/fetch (grounding-design.md, 2026-06-17).
//
// scripts/fetch is the "push it DOWN" binary: docs/source acquisition + cache +
// implicit verification, opaque to the agent. These tests exercise it as plain
// software (the Type-C ring, free, gates every merge) against a LOCAL file://
// fixture repo — real git, no network — so they're hermetic and fast.
//
// Every spawn sets TESSER_HOME to a temp dir so the clone cache lands in a
// throwaway location, never the dev's real ~/.tesser.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fetchScript = path.join(repoRoot, "scripts", "fetch");

let tmpRoot: string;
let hermeticHome: string; // TESSER_HOME for the clone cache
let fixtureRepo: string; // a local git repo we clone over file://
let fixtureUrl: string;
let fixtureHead: string;

function git(args: string[], cwd: string) {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  });
}

function runFetch(level: string, url: string) {
  const res = spawnSync(fetchScript, [level, url], {
    encoding: "utf8",
    env: { ...process.env, TESSER_HOME: hermeticHome },
  });
  if (res.error) throw res.error;
  let json: any = null;
  try {
    json = JSON.parse(res.stdout);
  } catch {
    /* non-JSON stdout (usage/env errors print to stderr) */
  }
  return { status: res.status, json, stdout: res.stdout, stderr: res.stderr };
}

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tesser-fetch-"));
  hermeticHome = path.join(tmpRoot, "home");
  fs.mkdirSync(hermeticHome, { recursive: true });

  // Build a local fixture repo: README at root, a docs/ dir, and a src/ dir
  // whose contents must NOT appear at docs level but MUST at source level.
  fixtureRepo = path.join(tmpRoot, "fixtureproj", "widget");
  fs.mkdirSync(path.join(fixtureRepo, "docs"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRepo, "src"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRepo, "README.md"), "# widget\nA test fixture.\n");
  fs.writeFileSync(path.join(fixtureRepo, "docs", "guide.md"), "# Guide\nHow to use it.\n");
  fs.writeFileSync(path.join(fixtureRepo, "src", "main.txt"), "the actual source\n");
  git(["init", "-q", "-b", "main"], fixtureRepo);
  git(["add", "-A"], fixtureRepo);
  git(["commit", "-q", "-m", "init"], fixtureRepo);
  fixtureHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: fixtureRepo, encoding: "utf8" }).trim();
  fixtureUrl = `file://${fixtureRepo}`;
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("scripts/fetch — docs level", () => {
  it("materializes README + docs/, pins the real HEAD, exits 0", () => {
    const r = runFetch("docs", fixtureUrl);
    expect(r.status).toBe(0);
    expect(r.json.status).toBe("ok");
    expect(r.json.level).toBe("docs");
    expect(r.json.sha).toBe(fixtureHead); // pin = rev-parse HEAD of the clone
    expect(r.json.identity).toBe("file/fixtureproj/widget");
    expect(fs.existsSync(path.join(r.json.root, ".git"))).toBe(true);
    expect(r.json.files).toContain("README.md");
    expect(r.json.files).toContain(path.join("docs", "guide.md"));
  });

  it("does NOT materialize source at docs level (the fast beat-1 fetch)", () => {
    const r = runFetch("docs", fixtureUrl);
    // src/main.txt is not a doc; the agent shouldn't be handed source here.
    expect(r.json.files.some((f: string) => f.includes("main.txt"))).toBe(false);
  });

  it("reports from_cache=false on first clone, true on reuse (cache is internal)", () => {
    // Fresh home so the first call is genuinely cold.
    const freshHome = fs.mkdtempSync(path.join(tmpRoot, "h-"));
    const cold = spawnSync(fetchScript, ["docs", fixtureUrl], {
      encoding: "utf8",
      env: { ...process.env, TESSER_HOME: freshHome },
    });
    const warm = spawnSync(fetchScript, ["docs", fixtureUrl], {
      encoding: "utf8",
      env: { ...process.env, TESSER_HOME: freshHome },
    });
    expect(JSON.parse(cold.stdout).from_cache).toBe(false);
    expect(JSON.parse(warm.stdout).from_cache).toBe(true);
  });
});

describe("scripts/fetch — source level (same clone, widened)", () => {
  it("widens the SAME clone to the full tree at the SAME pin", () => {
    const freshHome = fs.mkdtempSync(path.join(tmpRoot, "h-"));
    const docs = spawnSync(fetchScript, ["docs", fixtureUrl], {
      encoding: "utf8",
      env: { ...process.env, TESSER_HOME: freshHome },
    });
    const source = spawnSync(fetchScript, ["source", fixtureUrl], {
      encoding: "utf8",
      env: { ...process.env, TESSER_HOME: freshHome },
    });
    const d = JSON.parse(docs.stdout);
    const s = JSON.parse(source.stdout);
    expect(s.status).toBe("ok");
    expect(s.root).toBe(d.root); // one progressively-materialized clone
    expect(s.sha).toBe(d.sha); // pin held, never chasing upstream
    expect(s.files).toContain("src/");
    // the actual source blob is now on disk under root
    expect(fs.existsSync(path.join(s.root, "src", "main.txt"))).toBe(true);
  });
});

describe("scripts/fetch — implicit verification (never block on certainty)", () => {
  it("reports unreachable (exit 5, JSON, not a crash) for a missing repo — 'can't reach', not 'doesn't exist'", () => {
    const r = runFetch("docs", `file://${path.join(tmpRoot, "nope", "ghost")}`);
    expect(r.status).toBe(5);
    expect(r.json.status).toBe("unreachable");
    expect(r.json.identity).toBe("file/nope/ghost"); // parseable, just unreachable
    expect(typeof r.json.detail).toBe("string");
    expect(r.json.detail.length).toBeGreaterThan(0);
    // a failed clone is a normal outcome, never a Python traceback
    expect(r.stderr).not.toContain("Traceback");
  });

  it("exits 2 (usage) on an unparseable, non-URL reference", () => {
    const r = runFetch("docs", "just-a-bare-name");
    expect(r.status).toBe(2);
    expect(r.json).toBeNull();
    expect(r.stderr).toMatch(/not a parseable git URL/);
  });
});
