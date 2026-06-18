// CALIBRATED Obligation B — the cross-modal LLM-judge panel.
//
//   npm run judge -- <session-id>                  # judge across BOTH families (claude + codex)
//   npm run judge -- <session-id> --single          # claude only (cheaper; loses decorrelation)
//   npm run judge -- <session-id> --adversarial      # + a pass that REFUTES the claude verdict
//   npm run judge -- <session-id> --question-turn N  # override question turn
//
// Grades a PRODUCED answer (judge the artifact, not dictated text) against
// judge-rubric.ts, with the KNOWN_FAILURE_MODES self-corrections baked in. The
// cross-modal method (gbrain cross-modal-eval; the frame-walk panel, 2026-06-18):
// score on TWO model FAMILIES — Anthropic (`claude -p`) AND OpenAI (`codex exec`) —
// so blind spots don't correlate. A FAIL from either family sinks the run. The
// deterministic structural floor prints alongside, so no LLM call is trusted alone.
//
// Real model calls (your CLI auth), so this is run on demand, never in `npm test`.

import { spawn } from "node:child_process";
import { resolveSession, defaultProjectsDir } from "./resolve.ts";
import { parseSession, answerTurns } from "./parse.ts";
import { scoreSession } from "./score.ts";
import {
  buildJudgePrompt,
  parseVerdictLine,
  crossModalSummary,
  PRINCIPLES,
  type FamilyVerdict,
  type Verdict,
} from "./judge-rubric.ts";

interface Args {
  session?: string;
  adversarial: boolean;
  single: boolean;
  questionTurn?: number;
  projectsDir?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { adversarial: false, single: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--adversarial") a.adversarial = true;
    else if (t === "--single") a.single = true;
    else if (t === "--question-turn") a.questionTurn = Number(argv[++i]);
    else if (t === "--projects-dir") a.projectsDir = argv[++i];
    else if (!t.startsWith("--") && !a.session) a.session = t;
  }
  return a;
}

// A model FAMILY: spawn a real call, return its raw answer text. The cross-modal
// method needs DIFFERENT providers so blind spots don't correlate (the Claude-only
// panel is the explicit anti-pattern), so we run Anthropic (claude -p) AND OpenAI
// (codex exec) on the same rubric.
type Family = { name: string; run: (prompt: string) => Promise<string> };

function spawnText(
  cmd: string,
  argv: string[],
  pick: (stdout: string, stderr: string) => string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    // stdin closed: codex exec / claude -p must not block waiting on it.
    const child = spawn(cmd, argv, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${cmd} judge exceeded 300s`));
    }, 300_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(pick(out, err));
    });
  });
}

function askClaude(prompt: string): Promise<string> {
  return spawnText("claude", ["-p", prompt, "--output-format", "json"], (out, err) => {
    try {
      return String(JSON.parse(out).result ?? out);
    } catch {
      return out || err;
    }
  });
}

// OpenAI via the codex CLI — the independent (non-Claude) family. read-only sandbox
// so it never prompts for approval; the prompt is self-contained (no repo needed).
// codex exec interleaves CLI scaffolding into stdout, so strip the obvious meta lines
// — the VERDICTS parse is line-scanning and tolerant of the rest either way.
function askCodex(prompt: string): Promise<string> {
  return spawnText(
    "codex",
    ["exec", prompt, "-s", "read-only", "-c", 'model_reasoning_effort="medium"'],
    (out, err) => {
      const cleaned = (out || err)
        .split(/\r?\n/)
        .filter((l) => !/^(codex|tokens used|user|thinking)$/i.test(l.trim()))
        .join("\n")
        .trim();
      return cleaned || out || err;
    },
  );
}

const MARK = (v?: Verdict): string => v ?? "·";

function renderCrossModal(families: FamilyVerdict[]): string {
  const s = crossModalSummary(families);
  const names = families.map((f) => f.family);
  const col = (x: string) => x.padEnd(9);
  const lines: string[] = [];
  lines.push(`CROSS-MODAL PANEL (families: ${names.join(", ")}) — a FAIL from ANY family sinks the run:`);
  lines.push(`  #   ${"principle".padEnd(22)}${names.map(col).join("")}`);
  for (const r of s.rows) {
    const cells = names.map((n) => col(MARK(r.verdicts[n]))).join("");
    lines.push(`  ${String(r.n).padEnd(3)} ${r.name.padEnd(22)}${cells}${r.disagree ? "◀ disagree" : ""}`);
  }
  lines.push("");
  lines.push(
    "  family pass:  " +
      names.map((n) => `${n} ${s.familyPass[n] ? "✓" : "✗"}`).join("   "),
  );
  if (s.unusableFamilies.length)
    lines.push(`  UNUSABLE (no VERDICTS line parsed): ${s.unusableFamilies.join(", ")}`);
  lines.push(
    `  disagreements: ${s.disagreements.length ? s.disagreements.join(", ") + "  (← decorrelated blind spots — read both verdicts there)" : "none"}`,
  );
  lines.push(`  PANEL GATE: ${s.panelPass ? "✓ PASS (no FAIL from any usable family)" : "✗ FAIL"}`);
  return lines.join("\n");
}

function structuralFloor(sessionPath: string, questionTurn?: number): string {
  const s = scoreSession(sessionPath, "tesser", { questionTurn });
  const d = s.digestible;
  const c = s.calibrated;
  return [
    "DETERMINISTIC FLOOR (non-foolable gates — cross-check the judge against these):",
    `  length          ${d.firstAnswerChars} chars (first answer)`,
    `  answer leads     ${d.answerLeads ? "✓" : "✗ narration lead"}`,
    `  lexicon leak     ${d.lexiconLeakTotal}${d.lexiconLeakTotal ? " ✗" : " ✓"}`,
    `  overclaim        ${c.overclaimMarkers}`,
    `  gaps surfaced    ${c.gapsSurfaced}`,
    `  provenance (A)   ${c.provenanceCount}`,
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.session) {
    console.log("usage: npm run judge -- <session-id> [--single] [--adversarial] [--question-turn N]");
    process.exit(2);
  }
  const projectsDir = args.projectsDir ?? defaultProjectsDir();
  let sessionPath: string;
  try {
    sessionPath = resolveSession(args.session, projectsDir);
    if (sessionPath !== args.session) console.error(`[resolved] ${args.session} → ${sessionPath}`);
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    process.exit(2);
    return;
  }

  const view = parseSession(sessionPath);
  const turns = answerTurns(view, args.questionTurn);
  if (turns.length === 0) {
    console.error("error: no gradable answer turns found (is this a tesser session?)");
    process.exit(2);
    return;
  }
  const totalChars = turns.reduce((n, t) => n + t.rendered.length, 0);
  const machinery = turns.map((t, i) => `T${i + 1}: ${t.toolLeadCount} before answer / ${t.toolCount} total`).join("  |  ");

  const families: Family[] = args.single
    ? [{ name: "claude", run: askClaude }]
    : [{ name: "claude", run: askClaude }, { name: "codex", run: askCodex }];
  console.error(
    `[judge] grading ${turns.length} answer turn(s), ${totalChars} chars total, via ${families.map((f) => f.name).join(" + ")} …`,
  );

  console.log("\n" + structuralFloor(sessionPath, args.questionTurn));
  console.log(`  machinery        ${machinery}`);

  // The judge grades the rendered transcript (tool blocks interleaved), not prose alone.
  const prompt = buildJudgePrompt(turns.map((t) => ({ question: t.question, answer: t.rendered })));
  const settled = await Promise.allSettled(families.map((f) => f.run(prompt)));

  const verdicts: FamilyVerdict[] = [];
  let claudeRaw = ""; // the primary family's text feeds the adversarial pass
  settled.forEach((res, i) => {
    const fam = families[i].name;
    if (res.status === "rejected") {
      console.log(`\n── ${fam.toUpperCase()} FAMILY: call failed (${(res.reason as Error).message}) ──`);
      verdicts.push({ family: fam, perPrinciple: {}, parseFailed: true });
      return;
    }
    const raw = res.value;
    if (fam === "claude") claudeRaw = raw;
    console.log(`\n── ${fam.toUpperCase()} FAMILY (Obligation B — faithful confidence + the 11 principles) ──\n`);
    console.log(raw);
    const parsed = parseVerdictLine(raw);
    verdicts.push(
      parsed
        ? { family: fam, perPrinciple: parsed.perPrinciple, weakest: parsed.weakest, parseFailed: false }
        : { family: fam, perPrinciple: {}, parseFailed: true },
    );
  });

  if (families.length > 1) {
    console.log("\n" + renderCrossModal(verdicts));
  }

  if (args.adversarial && claudeRaw) {
    console.error("[judge] running adversarial refutation pass …");
    const refute = [
      "You are an adversarial reviewer of another judge's grading. Below is a developer-facing",
      "answer and a judge's verdict on it. Your ONLY job is to REFUTE the verdict: find every",
      "place the judge was too LENIENT (called something PASS/PARTIAL that has a quotable",
      "violation) — that is the judge's known leniency bias. Also flag any place it was too",
      "harsh. Quote the answer text. Return a short markdown list of corrections, or 'NO",
      "REFUTATION — verdict holds' if it is sound.",
      "",
      "=== CONVERSATION ===",
      turns
        .map((t, i) => `--- TURN ${i + 1}${t.question ? ` (asked: ${t.question.slice(0, 200)})` : ""} ---\n${t.rendered}`)
        .join("\n\n"),
      "",
      "=== JUDGE VERDICT ===",
      claudeRaw,
    ].join("\n");
    const refutation = await askClaude(refute);
    console.log("\nADVERSARIAL PASS (refutes the leniency failure mode):\n");
    console.log(refutation);
  }
}

main();
