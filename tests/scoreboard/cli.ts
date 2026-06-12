// tesser scoreboard scorer (T7) — CLI.
//
// Score a dogfood session against scoreboard.yaml, or compare a tesser run
// against a default-agent run for the win-condition verdict.
//
//   npm run score -- <session.jsonl>                       # score one (assumes tesser)
//   npm run score -- <session.jsonl> --role default        # score a default-agent run
//   npm run score -- <tesser.jsonl> --vs <default.jsonl>    # pair → win verdict
//   npm run score -- <session.jsonl> --question-turn 1      # override question turn
//   npm run score -- <session.jsonl> --json                 # machine-readable
//
// Runs on stock Node 22+/24 (type-stripping, no build, no extra deps).

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
    else if (t === "--json") a.json = true;
    else if (!t.startsWith("--") && !a.session) a.session = t;
    else if (t === "-h" || t === "--help") {
      a.session = undefined;
      break;
    }
  }
  return a;
}

const USAGE = `tesser scoreboard scorer
  node tests/scoreboard/cli.ts <session.jsonl> [--role tesser|default]
  node tests/scoreboard/cli.ts <tesser.jsonl> --vs <default.jsonl>
  options: --question-turn N  --vs-question-turn N  --json`;

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
    process.exit(args.session === undefined && process.argv.length > 2 ? 0 : 2);
  }

  const tesser = scoreSession(args.session!, args.role, {
    questionTurn: args.questionTurn,
  });

  if (!args.vs) {
    if (args.json) console.log(JSON.stringify(tesser, null, 2));
    else {
      console.log(`\n${args.role} run`);
      console.log(fmtAxes(tesser));
    }
    return;
  }

  const def = scoreSession(args.vs, args.vsRole, {
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
