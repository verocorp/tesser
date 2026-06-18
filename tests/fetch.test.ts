// Unit tests for scripts/fetch (skillify step 4) — grounding-design.md, 2026-06-17.
//
// scripts/fetch is the "push it DOWN" deterministic binary: docs/source acquisition
// + cache + implicit verification, opaque to the agent. Per gbrain skillify, a
// deterministic script's bar is correctness (same input, same output), proven by
// unit tests that cover every branch — not an LLM eval. These exercise it against a
// LOCAL file:// fixture repo (real git, no network) so they're hermetic and fast; a
// live-endpoint integration test (skillify step 5) against a real remote is still owed.
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

// --- name->identity index (D7): the bare-name re-ask resolves to a known identity
// + canonical URL without re-searching. Each test uses its OWN throwaway home so the
// record/resolve ordering is deterministic and isolated from the docs/source tests.
function freshHome(): string {
  return fs.mkdtempSync(path.join(tmpRoot, "idx-"));
}
function runIn(home: string, args: string[]) {
  const res = spawnSync(fetchScript, args, {
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

describe("scripts/fetch — name->identity index (D7)", () => {
  it("a bare name is unknown before any grounding (a 'go search' signal, exit 0)", () => {
    const r = runIn(freshHome(), ["resolve", "widget"]);
    expect(r.status).toBe(0);
    expect(r.json.status).toBe("unknown");
    expect(r.json.query).toBe("widget");
  });

  it("a successful fetch records the identity; a later bare-name re-ask resolves (the founding case)", () => {
    const home = freshHome();
    const fetched = runIn(home, ["docs", fixtureUrl]);
    expect(fetched.json.status).toBe("ok");
    // second ask, bare repo name, no URL — must resolve from the index, not search
    const r = runIn(home, ["resolve", "widget"]);
    expect(r.status).toBe(0);
    expect(r.json.status).toBe("ok");
    expect(r.json.matched).toBe("alias");
    expect(r.json.from_index).toBe(true);
    expect(r.json.identity).toBe("file/fixtureproj/widget");
    expect(r.json.url).toBe(fixtureUrl); // the stored canonical URL the background needs for drift
    expect(r.json.digests).toEqual([]); // empty until persist (T4) populates it
  });

  it("resolves the org/repo alias and is case-insensitive on the name", () => {
    const home = freshHome();
    runIn(home, ["docs", fixtureUrl]);
    const orgRepo = runIn(home, ["resolve", "fixtureproj/widget"]);
    expect(orgRepo.json.status).toBe("ok");
    expect(orgRepo.json.identity).toBe("file/fixtureproj/widget");
    const upper = runIn(home, ["resolve", "WIDGET"]);
    expect(upper.json.status).toBe("ok");
    expect(upper.json.identity).toBe("file/fixtureproj/widget");
  });

  it("a URL resolves from normalization even when never recorded (from_index=false)", () => {
    const r = runIn(freshHome(), ["resolve", fixtureUrl]);
    expect(r.json.status).toBe("ok");
    expect(r.json.matched).toBe("url");
    expect(r.json.from_index).toBe(false);
    expect(r.json.identity).toBe("file/fixtureproj/widget");
  });

  it("a corrupt index degrades to 'unknown', never a crash", () => {
    const home = freshHome();
    fs.writeFileSync(path.join(home, "identity-index.json"), "{ this is not json");
    const r = runIn(home, ["resolve", "widget"]);
    expect(r.status).toBe(0);
    expect(r.json.status).toBe("unknown");
    expect(r.stderr).not.toContain("Traceback");
  });

  it("an index write never blocks acquisition (fetch still succeeds with a corrupt index)", () => {
    const home = freshHome();
    fs.writeFileSync(path.join(home, "identity-index.json"), "garbage");
    const fetched = runIn(home, ["docs", fixtureUrl]);
    expect(fetched.status).toBe(0);
    expect(fetched.json.status).toBe("ok"); // the load_index skeleton rebuilt over the garbage
  });

  it("exits 2 (usage) when resolve is given no query", () => {
    const r = runIn(freshHome(), ["resolve"]);
    expect(r.status).toBe(2);
    expect(r.json).toBeNull();
  });

  // D7 requires the alias map to key on the PACKAGE/IMPORT name, not just the repo
  // path — the typed name often differs from the repo basename. --alias carries it.
  it("records the developer's typed name (--alias) so a name != repo-basename re-ask resolves", () => {
    const home = freshHome();
    // the repo basename is "widget"; the dev typed "wdgt" — without --alias it would miss
    const missBefore = runIn(home, ["resolve", "wdgt"]);
    expect(missBefore.json.status).toBe("unknown");

    const fetched = runIn(home, ["docs", fixtureUrl, "--alias", "wdgt"]);
    expect(fetched.json.status).toBe("ok");

    const hit = runIn(home, ["resolve", "wdgt"]);
    expect(hit.json.status).toBe("ok");
    expect(hit.json.identity).toBe("file/fixtureproj/widget");
    expect(hit.json.aliases).toContain("wdgt");
    // the URL-derived aliases still work alongside the typed one
    expect(runIn(home, ["resolve", "widget"]).json.identity).toBe("file/fixtureproj/widget");
  });

  it("accepts multiple --alias values (a dep can have several names)", () => {
    const home = freshHome();
    runIn(home, ["docs", fixtureUrl, "--alias", "w1", "--alias", "w2"]);
    expect(runIn(home, ["resolve", "w1"]).json.identity).toBe("file/fixtureproj/widget");
    expect(runIn(home, ["resolve", "w2"]).json.identity).toBe("file/fixtureproj/widget");
  });
});

// --- consult (CC-T2): serve a cached claim. Foreground gets the citation-STRIPPED
// view (claim + grade, never ⟦⟧@sha markup); --background gets the full cited digest.
// A digest is written straight onto disk under the home's digests root (consult is a
// local read — no clone, no network). ID matches the identity of fixtureUrl.
function writeDigestFile(
  home: string,
  identity: string,
  sha: string,
  grade: string,
  body: string,
  ts = "2026-06-10T18:04:00Z",
): string {
  const segs = identity.split("/");
  const repo = segs[segs.length - 1];
  const dir = path.join(home, "digests", ...segs.slice(0, -1));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${repo}@${sha.slice(0, 12)}.md`);
  fs.writeFileSync(
    file,
    `---\nrepo: file://x\nsha: ${sha}\ntruth_grade: ${grade}\nts: ${ts}\n---\n${body}`,
  );
  return file;
}

describe("scripts/fetch — consult (CC-T2): serve a cached claim", () => {
  const ID = "file/fixtureproj/widget"; // = the identity fixtureUrl normalizes to
  const SHA_A = "1111111111111111111111111111111111111111";
  const SHA_B = "2222222222222222222222222222222222222222";

  it("misses (exit 0) for an unknown name — the normal 'ground fresh' signal", () => {
    const r = runIn(freshHome(), ["consult", "nonesuch"]);
    expect(r.status).toBe(0);
    expect(r.json.status).toBe("miss");
    expect(r.json.reason).toBe("unknown-identity");
  });

  it("misses (no-digest) when the identity is known but nothing is cached", () => {
    const r = runIn(freshHome(), ["consult", fixtureUrl]);
    expect(r.json.status).toBe("miss");
    expect(r.json.reason).toBe("no-digest");
    expect(r.json.identity).toBe(ID);
  });

  it("foreground view: stripped claim + grade, and NEVER ⟦⟧ markup (binary guarantee)", () => {
    const home = freshHome();
    writeDigestFile(home, ID, SHA_A, "docs",
      "p-limit caps concurrency ⟦README.md:L1-L3⟧, and from training ⟦recall⟧.");
    const r = runIn(home, ["consult", fixtureUrl]);
    expect(r.json.status).toBe("hit");
    expect(r.json.view).toBe("foreground");
    expect(r.json.grade).toBe("docs");
    expect(r.json.claims).toContain("caps concurrency");
    // both the file citation and the recall marker are stripped from the claim
    expect(r.json.claims).not.toContain("⟦");
    expect(r.json.claims).not.toContain("README.md");
    // the guarantee: no reserved-bracket markup anywhere in the foreground output
    expect(r.stdout).not.toContain("⟦");
  });

  it("background view: the full cited digest, provenance intact", () => {
    const home = freshHome();
    writeDigestFile(home, ID, SHA_A, "docs", "A claim ⟦README.md:L1-L3⟧.");
    const r = runIn(home, ["consult", fixtureUrl, "--background"]);
    expect(r.json.status).toBe("hit");
    expect(r.json.view).toBe("background");
    expect(r.json.content).toContain("⟦README.md:L1-L3⟧");
  });

  it("selects the highest-grade digest among several for one identity", () => {
    const home = freshHome();
    // a NEWER docs digest and an OLDER inspect digest — grade must win over recency
    writeDigestFile(home, ID, SHA_A, "docs", "docs claim ⟦README.md:L1-L2⟧.", "2026-06-10T00:00:00Z");
    writeDigestFile(home, ID, SHA_B, "inspect", "inspected ⟦src/x.js:L1-L2⟧.", "2026-06-09T00:00:00Z");
    const r = runIn(home, ["consult", fixtureUrl]);
    expect(r.json.status).toBe("hit");
    expect(r.json.truth_grade).toBe("inspect");
  });

  it("a bare name resolves to its cached digest after one grounding (index + consult together)", () => {
    const home = freshHome();
    runIn(home, ["docs", fixtureUrl]); // records identity + the 'widget' alias
    writeDigestFile(home, ID, SHA_A, "docs", "cached ⟦README.md:L1-L2⟧.");
    const r = runIn(home, ["consult", "widget"]); // bare name, no URL
    expect(r.json.status).toBe("hit");
    expect(r.json.identity).toBe(ID);
  });
});
