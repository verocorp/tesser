// CALIBRATED Obligation B — the LLM-judge runner.
//
//   npm run judge -- <session-id>                  # judge a produced tesser answer
//   npm run judge -- <session-id> --adversarial     # + a second pass that REFUTES the first
//   npm run judge -- <session-id> --question-turn N  # override question turn
//
// Grades a PRODUCED answer (testing-agent-skills: judge the artifact, not dictated
// text) against judge-rubric.ts, with the KNOWN_FAILURE_MODES self-corrections
// baked in. Prints the deterministic structural floor (the non-foolable gates)
// next to the judge's verdict so the LLM call is never trusted alone.
//
// Spawns `claude -p` (uses your CLI auth, no API key needed); a real model call,
// so this is run on demand, never in `npm test`.

import { spawn } from "node:child_process";
import { resolveSession, defaultProjectsDir } from "./resolve.ts";
import { parseSession, questionTurnIndex, type SessionView } from "./parse.ts";
import { scoreSession, looksLikeNarration } from "./score.ts";
import { buildJudgePrompt } from "./judge-rubric.ts";

interface Args {
  session?: string;
  adversarial: boolean;
  questionTurn?: number;
  projectsDir?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { adversarial: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--adversarial") a.adversarial = true;
    else if (t === "--question-turn") a.questionTurn = Number(argv[++i]);
    else if (t === "--projects-dir") a.projectsDir = argv[++i];
    else if (!t.startsWith("--") && !a.session) a.session = t;
  }
  return a;
}

/** The produced answer the dev saw = from the first non-narration >=250-char
 *  block to the end (the summary + close, minus the machinery preamble). */
function extractAnswer(view: SessionView, questionTurn?: number): string {
  const qi = questionTurnIndex(view, questionTurn);
  const qTs = view.userTurns[qi]?.ts;
  const after = view.assistantBlocks.filter((b) => !qTs || b.ts >= qTs);
  const idx = after.findIndex((b) => b.chars >= 250 && !looksLikeNarration(b.text));
  return after.slice(idx >= 0 ? idx : 0).map((b) => b.text).join("\n\n");
}

function askClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", prompt, "--output-format", "json"]);
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("claude judge exceeded 300s"));
    }, 300_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        resolve(String(JSON.parse(out).result ?? out));
      } catch {
        resolve(out || err);
      }
    });
  });
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
    console.log("usage: npm run judge -- <session-id> [--adversarial] [--question-turn N]");
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
  const answer = extractAnswer(view, args.questionTurn);
  console.error(`[judge] grading ${answer.length}-char produced answer via claude -p …`);

  console.log("\n" + structuralFloor(sessionPath, args.questionTurn));
  const verdict = await askClaude(buildJudgePrompt(answer));
  console.log("\nLLM JUDGE (Obligation B — faithful confidence + the 8 principles):\n");
  console.log(verdict);

  if (args.adversarial) {
    console.error("[judge] running adversarial refutation pass …");
    const refute = [
      "You are an adversarial reviewer of another judge's grading. Below is a developer-facing",
      "answer and a judge's verdict on it. Your ONLY job is to REFUTE the verdict: find every",
      "place the judge was too LENIENT (called something PASS/PARTIAL that has a quotable",
      "violation) — that is the judge's known leniency bias. Also flag any place it was too",
      "harsh. Quote the answer text. Return a short markdown list of corrections, or 'NO",
      "REFUTATION — verdict holds' if it is sound.",
      "",
      "=== ANSWER ===",
      answer,
      "",
      "=== JUDGE VERDICT ===",
      verdict,
    ].join("\n");
    const refutation = await askClaude(refute);
    console.log("\nADVERSARIAL PASS (refutes the leniency failure mode):\n");
    console.log(refutation);
  }
}

main();
