// Type-D behavioral e2e (T6 seed) — the FIRST model-in-the-loop test.
//
// Gated behind RUN_E2E=1 so the deterministic suite (`npm test`) never spawns
// a model. Run it deliberately:  RUN_E2E=1 npx vitest run tests/skill.e2e.test.ts
//
// What this PROVES (obedience, per the doctrine's Type D):
//   - the agent, handed only SKILL.md, drives the spine end to end:
//     opens the log, clones+pins, answers with a file:line citation in the
//     grammar, and finalizes the log.
//   - assertions are on OBSERVABLE SIDE EFFECTS (the log file, the citation
//     token in the output), never on the prose's quality.
//   - assertions are LOOSE (any valid outcome enum; warn-not-fail on the
//     best-effort digest persist) because the layer under test is stochastic.
//
// What this does NOT prove (owned elsewhere / deferred until v1-complete):
//   - provisional-then-upgraded timing + superseding (§6/§8) — needs the
//     background-build notification lifecycle, not exercisable headlessly here.
//   - async drift handling (§3, D22).
//   - ANSWER QUALITY — there is no rubric/LLM-judge yet. This test checks
//     THAT the agent cited and logged, not whether the answer is GOOD. The
//     quality ring (rubric + threshold, judged on the produced digest) is the
//     deferred v1-complete assertion.
//   - the validator/logger/schema internals — those are pinned by the
//     deterministic Type-A/C suites; this test must not re-prove them.
//
// Hermetic: tmp TESSER_HOME (state root), tmp file:// fixture repo (offline,
// instant "build"), real SKILL.md + scripts from the repo under test.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const RUN_E2E = !!process.env.RUN_E2E;
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const validator = path.join(repoRoot, "scripts", "validate-digest");
const skillMd = path.join(repoRoot, "SKILL.md");

// Citation grammar (loose form of digest-schema.yaml's token_pattern): a
// well-formed ⟦path:Lstart-Lend⟧ with an optional @sha12 suffix.
const CITATION = /⟦[^⟧\n]+:L\d+-L\d+⟧(@[0-9a-f]{12})?/;

let tmpRoot: string;
let tesserHome: string;
let fixtureDir: string;
let workDir: string;
let runResult: { text: string; subtype: string; isError: boolean };

/** Build a tiny offline file:// "dependency": one runnable, citable file. */
function makeFixture(): string {
  const dir = path.join(tmpRoot, "fixtureorg", "depthlib");
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  const git = (...a: string[]) =>
    execFileSync("git", a, { cwd: dir, encoding: "utf8" });
  fs.writeFileSync(
    path.join(dir, "src", "lib.py"),
    [
      "MAX_DEPTH = 8",
      "",
      "",
      "def search_depth():",
      '    """Return the configured maximum search depth."""',
      "    return MAX_DEPTH",
      "",
      "",
      'if __name__ == "__main__":',
      "    print(search_depth())",
      "",
    ].join("\n"),
  );
  git("init", "--quiet", "-b", "main");
  git("config", "user.email", "fixtures@tesser.invalid");
  git("config", "user.name", "tesser fixtures");
  git("add", "src/lib.py");
  git("commit", "--quiet", "-m", "depthlib fixture");
  return dir;
}

/** Drive the real skill headlessly. The prompt force-feeds determinism
 *  (principle 6) so a failure isolates the playbook path, not model wander.
 *  Async spawn (not spawnSync): a 2-minute model call must not block the
 *  vitest worker thread, or its RPC heartbeat times out mid-run. */
async function runSkillHeadless(): Promise<{ text: string; subtype: string; isError: boolean }> {
  const prompt = [
    `You are running the tesser skill. Read the playbook at ${skillMd} and follow it for this request. Non-interactive: never ask the user anything; make reasonable choices and proceed.`,
    ``,
    `Developer's question: "What is the default maximum search depth in this library, and where is it defined?"`,
    ``,
    `Force-fed context to keep this run deterministic:`,
    `- The dependency is the local repository at file://${fixtureDir}. Treat it as already resolved to that clone URL. Do NOT search the web or look at any other repo.`,
    `- It is a clonable-library; classify it as such.`,
    `- Use ${tesserHome} as the state root (~/.tesser) for this run — it is already exported as TESSER_HOME. Clone into ${tesserHome}/clones/...`,
    `- The skill's scripts are at ${path.join(repoRoot, "scripts")}. Call scripts/log-invocation and scripts/validate-digest by their absolute paths there.`,
    `- There is nothing to compile. The verify step is to run \`python3 src/lib.py\` inside the clone, which prints the value — that is your run-grade verification.`,
    `- Skip the self-update git pull; it is irrelevant to this run.`,
    ``,
    `Run it end to end: open the log, pin+clone, answer with a ⟦path:Lstart-Lend⟧@sha12 citation at the pinned sha, verify by running the file, persist a digest if the run produced citable knowledge, and finalize the log.`,
  ].join("\n");

  const raw = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      "claude",
      [
        "-p", prompt,
        "--output-format", "json",
        "--dangerously-skip-permissions",
        "--add-dir", repoRoot,
        "--add-dir", tesserHome,
        "--add-dir", fixtureDir,
      ],
      {
        cwd: workDir,
        env: { ...process.env, TESSER_HOME: tesserHome },
      },
    );
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("claude headless run exceeded 600s"));
    }, 600_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 && out === "") {
        reject(new Error(`claude exited ${code}: ${err.slice(0, 500)}`));
      } else {
        resolve(out);
      }
    });
  });
  try {
    const j = JSON.parse(raw);
    return {
      text: String(j.result ?? raw),
      subtype: String(j.subtype ?? ""),
      isError: !!j.is_error,
    };
  } catch {
    return { text: raw, subtype: "", isError: false };
  }
}

function logLines(): Record<string, unknown>[] {
  const p = path.join(tesserHome, "log.jsonl");
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
}

describe.skipIf(!RUN_E2E)("Type-D e2e: agent drives the tesser spine from SKILL.md", () => {
  beforeAll(async () => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tesser-e2e-"));
    tesserHome = path.join(tmpRoot, "home");
    fs.mkdirSync(tesserHome, { recursive: true });
    workDir = path.join(tmpRoot, "work");
    fs.mkdirSync(workDir, { recursive: true });
    fixtureDir = makeFixture();
    runResult = await runSkillHeadless();
    // Surface what the agent actually did (the Type-D signal, for the run log).
    const lines = logLines();
    const fin = lines.find((l) => l.event === "finalized");
    const cite = runResult.text.match(CITATION);
    const digestsRoot = path.join(tesserHome, "digests");
    const persisted = fs.existsSync(digestsRoot)
      ? (fs.readdirSync(digestsRoot, { recursive: true }) as string[]).filter((f) => f.endsWith(".md"))
      : [];
    console.warn(
      `[e2e signal] subtype=${runResult.subtype} outcome=${fin?.outcome ?? "—"} ` +
      `citation=${cite ? cite[0] : "NONE"} digests=${persisted.length}`,
    );
  }, 660_000);

  afterAll(() => {
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("the run did not hard-error (success or max-turns both acceptable)", () => {
    // Loose: a stochastic run that hits the turn cap is not a test failure.
    expect(runResult.isError).toBe(false);
  });

  it("opens AND finalizes a log record sharing one id (the instrument)", () => {
    const lines = logLines();
    const opened = lines.filter((l) => l.event === "opened");
    const finalized = lines.filter((l) => l.event === "finalized");
    expect(opened.length, "expected an opened log line").toBeGreaterThanOrEqual(1);
    expect(finalized.length, "expected a finalized log line").toBeGreaterThanOrEqual(1);
    // At least one opened/finalized pair shares an id.
    const openIds = new Set(opened.map((l) => l.id));
    expect(finalized.some((l) => openIds.has(l.id))).toBe(true);
    // The opened record carries the question verbatim-ish and a derived source.
    expect(opened.some((l) => String(l.question).toLowerCase().includes("maximum search depth"))).toBe(true);
    expect(["seeded", "self"]).toContain(opened[0].invocation_source);
    // The finalized record carries a valid outcome (loose: any enum value).
    const fin = finalized.find((l) => openIds.has(l.id))!;
    expect(["completed", "completed-unverified", "install-failure", "aborted"]).toContain(fin.outcome);
  });

  it("delivers an answer carrying a grammar-valid file:line citation", () => {
    expect(runResult.text).toMatch(CITATION);
  });

  it("if a digest was persisted, it passes validate-digest (best-effort — warn, don't fail)", () => {
    const digestsRoot = path.join(tesserHome, "digests");
    if (!fs.existsSync(digestsRoot)) {
      console.warn("[e2e] no digest persisted this run — skipping digest validation");
      return;
    }
    const mdFiles = (fs.readdirSync(digestsRoot, { recursive: true }) as string[])
      .filter((f) => f.endsWith(".md"));
    if (mdFiles.length === 0) {
      console.warn("[e2e] digests/ exists but is empty — skipping");
      return;
    }
    const cloneDir = path.join(tesserHome, "clones", "fixtureorg", "depthlib");
    for (const f of mdFiles) {
      const args = [path.join(digestsRoot, f)];
      if (fs.existsSync(cloneDir)) args.push("--clone", cloneDir);
      const r = spawnSync(validator, args, {
        encoding: "utf8",
        env: { ...process.env, TESSER_HOME: tesserHome },
      });
      expect(r.status, `persisted digest ${f} failed validation:\n${r.stderr}`).toBe(0);
    }
  });
});
