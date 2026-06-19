// Integration gate: the reuse path, end to end through the real binaries.
//
// "Ask about a dep, ask again, the second time serves from cache" is a common
// entry point into understanding a dependency, and the claim-cache (CC) work
// exists to make it fast. Every CC unit test exercises ONE binary in isolation:
// fetch.test.ts plants digests by hand (writeDigestFile) and validator.test.ts
// persists hand-staged frontmatter. NOTHING chained the actual flow a re-ask
// runs — fetch docs (clone+pin+index) -> stage a real digest -> validate-digest
// --persist (validate+atomic move) -> consult (serve the stripped claim). The
// claim-cache session asserted this loop was "proven end to end" on a manual
// smoke test only; this is the regression guard that makes it a property.
//
// Hermetic: one shared TESSER_HOME and a local file:// git fixture (real git,
// no network), so the index, the persisted digest, and the consult all read the
// same throwaway state — exactly as two asks in one ~/.tesser would.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fetchScript = path.join(repoRoot, "scripts", "fetch");
const validator = path.join(repoRoot, "scripts", "validate-digest");

// dependency_kind enum comes from the schema, not a hardcoded copy (spec-as-data).
const schema = yaml.load(
  fs.readFileSync(path.join(repoRoot, "digest-schema.yaml"), "utf8"),
) as any;
const depKind = schema.frontmatter.required.dependency_kind.enum[1];

let tmpRoot: string;
let home: string; // the shared TESSER_HOME — the dev's ~/.tesser stand-in
let fixtureRepo: string;
let fixtureUrl: string;

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

function run(args: string[]) {
  const res = spawnSync(args[0], args.slice(1), {
    encoding: "utf8",
    env: { ...process.env, TESSER_HOME: home },
  });
  if (res.error) throw res.error;
  let json: any = null;
  try {
    json = JSON.parse(res.stdout);
  } catch {
    /* usage/env errors print to stderr, not JSON */
  }
  return { status: res.status, json, stdout: res.stdout, stderr: res.stderr };
}

beforeAll(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tesser-reuse-"));
  home = path.join(tmpRoot, "home");
  fs.mkdirSync(home, { recursive: true });

  // A dep named "gizmo" under org "acme" with a multi-line README to cite.
  fixtureRepo = path.join(tmpRoot, "acme", "gizmo");
  fs.mkdirSync(fixtureRepo, { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRepo, "README.md"),
    "# gizmo\nGizmo caps concurrency.\nIt is a tiny utility.\nNo deps.\n",
  );
  git(["init", "-q", "-b", "main"], fixtureRepo);
  git(["add", "-A"], fixtureRepo);
  git(["commit", "-q", "-m", "init"], fixtureRepo);
  fixtureUrl = `file://${fixtureRepo}`;
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("reuse path: ground once, then a re-ask serves from cache", () => {
  let sha: string;
  let cloneRoot: string;

  it("ask #1: fetch docs clones, pins HEAD, and records the identity", () => {
    const r = run([fetchScript, "docs", fixtureUrl]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.json.status).toBe("ok");
    expect(r.json.identity).toBe("file/acme/gizmo");
    sha = r.json.sha;
    cloneRoot = r.json.root;
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("the background actor persists a docs-grade digest through validate-digest --persist", () => {
    // The agent stages a map at an arbitrary location (subagent-brief §6: the
    // staged path does not matter — --persist computes the real one).
    const staged = path.join(tmpRoot, "staged", "anything.md");
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    const fm = {
      repo: fixtureUrl,
      sha,
      env: { os: "darwin", arch: "arm64" },
      commands: [], // empty allowed at docs grade (D8)
      ts: "2026-06-18T00:00:00Z",
      dependency_kind: depKind,
      truth_grade: "docs",
    };
    fs.writeFileSync(
      staged,
      `---\n${yaml.dump(fm)}---\nGizmo caps concurrency ⟦README.md:L2-L2⟧.\n`,
    );

    const r = run([validator, staged, "--clone", cloneRoot, "--persist"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.json.status).toBe("persisted");
    // moved to the host-aware path computed from the frontmatter, not the staged dir
    expect(r.json.persisted).toBe(
      path.join(home, "digests", "file", "acme", `gizmo@${sha.slice(0, 12)}.md`),
    );
    expect(r.json.digest_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(staged)).toBe(false); // consumed by the move
  });

  it("ask #2 (by URL): consult serves the cached claim, citation-STRIPPED", () => {
    const r = run([fetchScript, "consult", fixtureUrl]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.json.status).toBe("hit");
    expect(r.json.view).toBe("foreground");
    expect(r.json.grade).toBe("docs");
    expect(r.json.claims).toContain("caps concurrency");
    // the whole point of the foreground view: no raw provenance reaches it
    expect(r.json.claims).not.toContain("⟦");
    expect(r.json.claims).not.toContain("README.md");
    expect(r.stdout).not.toContain("⟦");
  });

  it("ask #2 (by bare name): the index resolves the typed name to the same cached hit", () => {
    // The real re-ask shape — the dev types "gizmo", not the URL. Index (ask #1)
    // + persisted digest + consult must compose without a re-search.
    const r = run([fetchScript, "consult", "gizmo"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.json.status).toBe("hit");
    expect(r.json.identity).toBe("file/acme/gizmo");
    expect(r.json.view).toBe("foreground");
    expect(r.json.claims).not.toContain("⟦");
  });

  it("the background actor still gets the full cited digest (provenance intact)", () => {
    const r = run([fetchScript, "consult", fixtureUrl, "--background"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.json.status).toBe("hit");
    expect(r.json.view).toBe("background");
    expect(r.json.content).toContain("⟦README.md:L2-L2⟧");
  });
});
