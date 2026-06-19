// Seeded cache-applicability gates for `scripts/fetch consult` (claim-cache).
//
// consult is identity-keyed and QUESTION-AGNOSTIC: given a name/URL it returns the
// best digest for the resolved identity. So everything here is a pure function of
// cache state — we seed an exact hermetic TESSER_HOME and assert what consult
// serves. (The "is this claim relevant to THIS question / serve-vs-ground" guard is
// the agent's latent judgment — eval-gated, NOT here. See cache-applicability-test-
// spec.md case H.)
//
// Cases: A stale-sha serve (D4 serve-unchecked) · B bare-name collision (KNOWN
// last-writer-wins, TODOS.md) · C cross-host collision · D best-digest selection ·
// E corrupt-digest robustness · F strip invariant per grade · G cold control.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fetchScript = path.join(repoRoot, "scripts", "fetch");

let tmpRoot: string;
let counter = 0;

function git(args: string[], cwd: string) {
  execFileSync("git", args, {
    cwd,
    stdio: "pipe",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" },
  });
}

function freshHome(): string {
  const h = path.join(tmpRoot, `home-${counter++}`);
  fs.mkdirSync(h, { recursive: true });
  return h;
}

// A local git fixture repo at <tmpRoot>/<slug>/<org>/<repo>; returns its file:// URL.
function makeRepo(org: string, repo: string): string {
  const dir = path.join(tmpRoot, `fix-${counter++}`, org, repo);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "README.md"), `# ${repo}\nLine two.\nLine three.\n`);
  git(["init", "-q", "-b", "main"], dir);
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "init"], dir);
  return `file://${dir}`;
}

function run(home: string, args: string[]) {
  const res = spawnSync(fetchScript, args, { encoding: "utf8", env: { ...process.env, TESSER_HOME: home } });
  if (res.error) throw res.error;
  let json: any = null;
  try { json = JSON.parse(res.stdout); } catch { /* usage/env errors → stderr */ }
  return { status: res.status, json, stdout: res.stdout, stderr: res.stderr };
}

const consult = (home: string, q: string, bg = false) =>
  run(home, bg ? ["consult", q, "--background"] : ["consult", q]);

// Seed a digest straight onto disk at the layout find_digests globs:
// <home>/digests/<host>/<org-path>/<repo>@<sha12>.md
function seedDigest(home: string, identity: string, o: { sha: string; grade: string; body: string; ts?: string }): string {
  const segs = identity.split("/").filter(Boolean);
  const repo = segs[segs.length - 1];
  const dir = path.join(home, "digests", ...segs.slice(0, -1));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${repo}@${o.sha.slice(0, 12)}.md`);
  fs.writeFileSync(file, `---\nrepo: file://x\nsha: ${o.sha}\ntruth_grade: ${o.grade}\nts: ${o.ts ?? "2026-06-10T00:00:00Z"}\n---\n${o.body}`);
  return file;
}

// Register a fixture's identity in the index (real index_record write path), then
// hand back the identity the binary actually produced (robust to normalization).
function setupRegistered(): { home: string; url: string; identity: string } {
  const home = freshHome();
  const url = makeRepo("acme", "gizmo");
  const docs = run(home, ["docs", url]);
  expect(docs.status, docs.stderr).toBe(0);
  return { home, url, identity: docs.json.identity };
}

const SHA = (c: string) => c.repeat(40);

beforeAll(() => { tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tesser-cacheapp-")); });
afterAll(() => { fs.rmSync(tmpRoot, { recursive: true, force: true }); });

// ---------------------------------------------------------------------------
describe("A — stale-sha serve (D4 serve-unchecked)", () => {
  it("serves the cached OLD-sha digest even when a clone exists at a newer HEAD; no drift check, no error", () => {
    const { home, url, identity } = setupRegistered(); // clone now exists at real HEAD
    const OLD = SHA("a");
    seedDigest(home, identity, { sha: OLD, grade: "docs", body: "Cached overview ⟦README.md:L1-L1⟧.", ts: "2026-01-01T00:00:00Z" });
    const r = consult(home, url);
    expect(r.status, r.stderr).toBe(0);
    expect(r.json.status).toBe("hit");
    expect(r.json.sha).toBe(OLD); // serves the cached sha, not the live clone HEAD
    expect(r.json.truth_grade).toBe("docs");
    expect(r.stderr).not.toContain("Traceback");
  });
});

// ---------------------------------------------------------------------------
describe("B — bare-name alias collision (KNOWN last-writer-wins, see TODOS.md)", () => {
  it("URL and org/repo disambiguate; the bare basename serves the LAST-recorded identity", () => {
    const home = freshHome();
    const urlA = makeRepo("orgA", "widget");
    const urlB = makeRepo("orgB", "widget");
    const idA = run(home, ["docs", urlA]).json.identity; // recorded first
    const idB = run(home, ["docs", urlB]).json.identity; // recorded second → owns "widget"
    expect(idA).not.toBe(idB);
    seedDigest(home, idA, { sha: SHA("a"), grade: "docs", body: "WIDGET-A ⟦README.md:L1-L1⟧." });
    seedDigest(home, idB, { sha: SHA("b"), grade: "docs", body: "WIDGET-B ⟦README.md:L1-L1⟧." });

    // URL → exact identity, always correct
    expect(consult(home, urlA).json.identity).toBe(idA);
    expect(consult(home, urlB).json.identity).toBe(idB);
    // org/repo alias → correct
    expect(consult(home, "orgA/widget").json.identity).toBe(idA);
    expect(consult(home, "orgB/widget").json.identity).toBe(idB);

    // bare basename → last-writer-wins (orgB). This PINS the accepted over-serve.
    const bare = consult(home, "widget");
    expect(bare.json.status).toBe("hit");
    expect(bare.json.identity).toBe(idB);
    expect(bare.json.claims).toContain("WIDGET-B");
    expect(bare.json.claims).not.toContain("WIDGET-A");
  });
});

// ---------------------------------------------------------------------------
describe("C — cross-host same-name collision (index seeded directly)", () => {
  it("URL/org-repo resolve per host; bare name serves the last-recorded host", () => {
    const home = freshHome();
    const idFoo = "github.com/foo/redis";
    const idBar = "gitlab.com/bar/redis";
    // emulate index_record order foo→bar (bar wins the bare "redis" alias)
    const idx: any = { version: 1, aliases: {}, identities: {} };
    for (const [id, u] of [[idFoo, "https://github.com/foo/redis"], [idBar, "https://gitlab.com/bar/redis"]]) {
      const segs = id.split("/");
      const aliases = [segs[segs.length - 1], segs.slice(-2).join("/"), id];
      idx.identities[id] = { canonical_url: u, aliases, digests: [] };
      for (const a of aliases) idx.aliases[a.toLowerCase()] = id; // last-writer-wins
    }
    fs.writeFileSync(path.join(home, "identity-index.json"), JSON.stringify(idx));
    seedDigest(home, idFoo, { sha: SHA("f"), grade: "docs", body: "REDIS-FOO ⟦README.md:L1-L1⟧." });
    seedDigest(home, idBar, { sha: SHA("c"), grade: "docs", body: "REDIS-BAR ⟦README.md:L1-L1⟧." });

    expect(consult(home, "https://github.com/foo/redis").json.identity).toBe(idFoo);
    expect(consult(home, "foo/redis").json.identity).toBe(idFoo);
    expect(consult(home, "bar/redis").json.identity).toBe(idBar);
    // bare "redis" → last writer (gitlab/bar)
    expect(consult(home, "redis").json.identity).toBe(idBar);
  });
});

// ---------------------------------------------------------------------------
describe("D — best-digest selection (grade beats recency, then ts, then sha)", () => {
  it("picks the highest grade even when a lower grade is newer; degrades as grades are removed", () => {
    const { home, url, identity } = setupRegistered();
    const runP = seedDigest(home, identity, { sha: SHA("a"), grade: "run", body: "RUN ⟦README.md:L1-L1⟧.", ts: "2026-01-01T00:00:00Z" });
    const inspectP = seedDigest(home, identity, { sha: SHA("c"), grade: "inspect", body: "INSPECT ⟦README.md:L1-L1⟧.", ts: "2026-03-01T00:00:00Z" });
    seedDigest(home, identity, { sha: SHA("b"), grade: "docs", body: "DOCS ⟦README.md:L1-L1⟧.", ts: "2026-06-01T00:00:00Z" }); // newest

    let r = consult(home, url);
    expect(r.json.truth_grade).toBe("run"); // grade > recency (docs is newer)
    expect(r.json.sha).toBe(SHA("a"));

    fs.rmSync(runP);
    r = consult(home, url);
    expect(r.json.truth_grade).toBe("inspect");

    fs.rmSync(inspectP);
    r = consult(home, url);
    expect(r.json.truth_grade).toBe("docs");
  });
});

// ---------------------------------------------------------------------------
describe("E — corrupt-digest robustness", () => {
  it("a malformed digest never crashes consult; a valid sibling still wins", () => {
    const { home, url, identity } = setupRegistered();
    seedDigest(home, identity, { sha: SHA("a"), grade: "docs", body: "VALID-CLAIM ⟦README.md:L1-L1⟧." });
    // a malformed file matching the <repo>@*.md glob (no frontmatter)
    const segs = identity.split("/").filter(Boolean);
    const dir = path.join(home, "digests", ...segs.slice(0, -1));
    fs.writeFileSync(path.join(dir, `${segs[segs.length - 1]}@bbbbbbbbbbbb.md`), "not a digest, no frontmatter\n");

    const r = consult(home, url);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).not.toContain("Traceback");
    expect(r.json.status).toBe("hit");
    expect(r.json.truth_grade).toBe("docs"); // valid (rank 1) beats corrupt (rank 0)
    expect(r.json.claims).toContain("VALID-CLAIM");
  });

  it("a cache holding ONLY a corrupt digest degrades to an empty-grade hit, still no crash", () => {
    const { home, url, identity } = setupRegistered();
    const segs = identity.split("/").filter(Boolean);
    const dir = path.join(home, "digests", ...segs.slice(0, -1));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${segs[segs.length - 1]}@cccccccccccc.md`), "garbage, no frontmatter\n");
    const r = consult(home, url);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).not.toContain("Traceback");
    // current behavior: a found-but-unparseable digest is a hit with empty grade
    // (NOT a miss). Pinned so a future change to miss-on-corrupt is a conscious one.
    expect(r.json.status).toBe("hit");
    expect(r.json.truth_grade).toBe("");
  });
});

// ---------------------------------------------------------------------------
describe("F — citation-strip invariant holds at every grade", () => {
  for (const grade of ["recall", "docs", "inspect", "run"]) {
    it(`${grade}: foreground strips all markup + carries the grade tag; background keeps full provenance`, () => {
      const { home, url, identity } = setupRegistered();
      const body = `A ${grade}-grade claim ⟦README.md:L1-L2⟧, plus from memory ⟦recall⟧.`;
      seedDigest(home, identity, { sha: SHA("a"), grade, body });

      const fg = consult(home, url);
      expect(fg.json.status).toBe("hit");
      expect(fg.json.view).toBe("foreground");
      expect(fg.json.grade).toBe(grade);
      expect(fg.json.claims).toContain("claim");
      expect(fg.json.claims).not.toContain("⟦");
      expect(fg.json.claims).not.toContain("README.md");
      expect(fg.stdout).not.toContain("⟦");

      const bg = consult(home, url, true);
      expect(bg.json.view).toBe("background");
      expect(bg.json.content).toContain("⟦README.md:L1-L2⟧");
    });
  }
});

// ---------------------------------------------------------------------------
describe("G — cold control (empty / no-digest)", () => {
  it("unknown identity → miss(unknown-identity)", () => {
    const r = consult(freshHome(), "totally-unknown-xyz");
    expect(r.status).toBe(0);
    expect(r.json.status).toBe("miss");
    expect(r.json.reason).toBe("unknown-identity");
  });

  it("known identity but no digest → miss(no-digest)", () => {
    const { home, url } = setupRegistered(); // identity registered, nothing seeded
    const r = consult(home, url);
    expect(r.status).toBe(0);
    expect(r.json.status).toBe("miss");
    expect(r.json.reason).toBe("no-digest");
  });
});
