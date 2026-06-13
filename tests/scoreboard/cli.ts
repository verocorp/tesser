// tesser scoreboard scorer (T7) — CLI.
//
// Score a dogfood session against scoreboard.yaml, or compare a tesser run
// against a default-agent run for the win-condition verdict.
//
// SESSION accepts a session id (full UUID or a short prefix), a `<uuid>.jsonl`
// filename, or a full path. Ids are resolved under ~/.claude/projects/** (the
// per-project session store), so you can pass what `claude` shows you:
//
//   npm run score -- db8e01b9                               # score by id prefix
//   npm run score -- db8e01b9 --role default                # a default-agent run
//   npm run score -- db8e01b9 --vs 617bdfbb                 # pair → win verdict
//   npm run score -- db8e01b9 --question-turn 1             # override question turn
//   npm run score -- db8e01b9 --json                        # machine-readable
//   npm run score -- ./path/to/session.jsonl                # explicit path still works
//   options: --projects-dir <dir>  (or env CLAUDE_PROJECTS_DIR)
//
// Runs on stock Node 22+/24 (type-stripping, no build, no extra deps).

import { resolveSession, defaultProjectsDir } from "./resolve.ts";
import {
  scoreSession,
  scorePair,
  type Role,
  type SessionScore,
} from "./score.ts";

interface Args {
  session?: string;
  vs?: string;
  role: Role;
  vsRole: Role;
  questionTurn?: number;
  vsQuestionTurn?: number;
  projectsDir?: string;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { role: "tesser", vsRole: "default", json: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--vs") a.vs = argv[++i];
    else if (t === "--role") a.role = argv[++i] as Role;
    else if (t === "--vs-role") a.vsRole = argv[++i] as Role;
    else if (t === "--question-turn") a.questionTurn = Number(argv[++i]);
    else if (t === "--vs-question-turn") a.vsQuestionTurn = Number(argv[++i]);
    else if (t === "--projects-dir") a.projectsDir = argv[++i];
    else if (t === "--json") a.json = true;
    else if (t === "-h" || t === "--help") {
      a.session = undefined;
      break;
    }
    else if (!t.startsWith("--") && !a.session) a.session = t;
  }
  return a;
}

const USAGE = `tesser scoreboard scorer
  node tests/scoreboard/cli.ts <session-id|path> [--role tesser|default]
  node tests/scoreboard/cli.ts <tesser-id|path> --vs <default-id|path>
  SESSION: a session id (UUID or prefix), <uuid>.jsonl, or a path; ids resolve
           under ~/.claude/projects/** (override: --projects-dir / CLAUDE_PROJECTS_DIR)
  options: --question-turn N  --vs-question-turn N  --projects-dir <dir>  --json`;

function fmtAxes(s: SessionScore): string {
  const f = s.faster;
  const d = s.digestible;
  const c = s.calibrated;
  const leakTerms = Object.entries(d.lexiconLeakTerms)
    .map(([k, n]) => `${k}×${n}`)
    .join(", ");
  return [
    `  session ${s.sessionId || "(unknown)"}  role=${s.role}  q-turn=${s.questionTurnIndex}`,
    `  question: ${JSON.stringify(s.question.slice(0, 80))}`,
    ``,
    `  FASTER`,
    `    TTFA            ${f.ttfaSeconds === null ? "n/a" : f.ttfaSeconds.toFixed(1) + "s"}  (${f.method})  ${f.meetsIdeal ? "✓ ideal" : f.passesHardGate ? "✓ pass" : "✗ over bar"}`,
    `    first answer    block #${f.firstAnswerBlockIndex ?? "—"}, ${f.firstAnswerChars} chars`,
    f.note ? `    ⚠ ${f.note}` : ``,
    `  DIGESTIBLE`,
    `    lexicon leak    ${d.lexiconLeakTotal}${leakTerms ? "  [" + leakTerms + "]" : ""}  ${d.lexiconLeakTotal === 0 ? "✓" : "✗ (hard-0)"}`,
    `    cite in lead    ${d.citationMarkupFirstAnswer}  ${d.citationMarkupFirstAnswer === 0 ? "✓" : "✗ above-the-fold"}   (total markup ${d.citationMarkupTotal})`,
    `    first-ans len   ${d.firstAnswerChars} chars`,
    `    answer leads    ${d.answerLeads ? "✓" : "✗"}${d.answerLeadsNote ? "  — " + d.answerLeadsNote : ""}`,
    `  CALIBRATED`,
    `    provenance (A)  ${c.provenanceCount} checkable pointers attached`,
    `    gaps surfaced   ${c.gapsSurfaced}  (coverage-map proxy)`,
    `    confidence (B)  not scored — ${c.bNote.split("—")[0].trim()}`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.session) {
    console.log(USAGE);
    process.exit(process.argv.length > 2 ? 0 : 2);
  }

  const projectsDir = args.projectsDir ?? defaultProjectsDir();
  let sessionPath: string;
  let vsPath: string | undefined;
  try {
    sessionPath = resolveSession(args.session, projectsDir);
    if (sessionPath !== args.session) console.error(`[resolved] ${args.session} → ${sessionPath}`);
    vsPath = args.vs ? resolveSession(args.vs, projectsDir) : undefined;
    if (vsPath && vsPath !== args.vs) console.error(`[resolved] ${args.vs} → ${vsPath}`);
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    process.exit(2);
  }

  const tesser = scoreSession(sessionPath, args.role, {
    questionTurn: args.questionTurn,
  });

  if (!vsPath) {
    if (args.json) console.log(JSON.stringify(tesser, null, 2));
    else {
      console.log(`\n${args.role} run`);
      console.log(fmtAxes(tesser));
    }
    return;
  }

  const def = scoreSession(vsPath, args.vsRole, {
    questionTurn: args.vsQuestionTurn,
  });
  const verdict = scorePair(tesser, def);

  if (args.json) {
    console.log(JSON.stringify({ tesser, default: def, verdict }, null, 2));
    return;
  }
  console.log(`\nTESSER`);
  console.log(fmtAxes(tesser));
  console.log(`\nDEFAULT`);
  console.log(fmtAxes(def));
  console.log(`\nWIN CONDITION  (tesser ≥ default on all 3, strictly better on ≥1, cold TTFA not worse)`);
  for (const r of verdict.reasons) console.log(`  ${r}`);
  console.log(`\n  ⇒ ${verdict.win ? "✓ tesser WINS this cell" : "✗ tesser does NOT win this cell"}`);
}

main();
