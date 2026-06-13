// tesser scoreboard scorer (T7) — the three-axis scorers.
//
// This is the executable form of scoreboard.yaml (D39/D40): it turns the
// measurement contract's axes into deterministic numbers from a session
// transcript. The bars and the forbidden-lexicon list are READ FROM
// scoreboard.yaml at runtime (spec-as-data, the same pattern validate-digest
// uses with digest-schema.yaml) — so the maintainer's pre-committed
// post-dogfood revision reflows in by editing the YAML, not this code.
//
// What is deterministic here: FASTER (TTFA), DIGESTIBLE (lexicon leak,
// citation placement, length, answer-leads), and CALIBRATED Obligation A
// (provenance attachment count) + gap-surfacing proxy. What is NOT scored
// here: CALIBRATED Obligation B (faithful confidence) — it has an agent-judged
// tail (scoreboard.yaml axes.calibrated.deterministic) and is reported as
// deferred, never silently zero.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import {
  parseSession,
  questionTurnIndex,
  type SessionView,
} from "./parse.ts";

export type Role = "default" | "tesser";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

// --- scoreboard.yaml as data -----------------------------------------------

interface ScoreboardSpec {
  ideal_seconds: number;
  pass_max_seconds: number;
  lexicon: string[]; // literal jargon terms (the citation-markup item is split out)
  marker?: RegExp; // optional tesser first-answer marker, if the spec defines one
}

export function loadScoreboard(path = join(repoRoot, "scoreboard.yaml")): ScoreboardSpec {
  const doc = yaml.load(readFileSync(path, "utf8")) as Record<string, any>;
  const faster = doc?.axes?.faster ?? {};
  const bar = faster.bar ?? {};
  const leak =
    doc?.axes?.digestible?.checks?.no_internal_lexicon_leak ?? {};
  // forbidden_lexicon is the FINAL list (D41); forbidden_lexicon_seed is the
  // pre-D41 name, kept as a fallback so an older spec still loads.
  const seed: string[] = leak.forbidden_lexicon ?? leak.forbidden_lexicon_seed ?? [];
  // The seed list mixes literal terms with one DESCRIPTION of the raw citation
  // markup ("raw ⟦...⟧@sha citation markup shown to a human"). Split it: literal
  // terms go to the lexicon scan, the markup is handled by the citation regex.
  const lexicon = seed.filter((t) => typeof t === "string" && !t.includes("⟦"));
  const markerSrc: string | undefined =
    faster.first_answer_marker ?? faster.first_answer_marker_regex;
  return {
    ideal_seconds: bar.ideal_seconds ?? 10,
    pass_max_seconds: bar.pass_max_seconds ?? 30,
    lexicon,
    marker: markerSrc ? new RegExp(markerSrc, "i") : undefined,
  };
}

// --- shared text views ------------------------------------------------------

/** Raw ⟦path:Lx-Ly⟧ citation markup (optional @sha suffix). The forbidden
 *  human-facing token AND the provenance-attachment unit (Obligation A). */
const CITATION = /⟦[^⟧\n]+⟧(@[0-9a-f]{6,40})?/g;

const GREETING_ONLY = /^(hi|hey|hello|yo|sup)\b[\s!.,]*$/i;

/** Process-narration markers tesser currently leads with (scoreboard.yaml
 *  digestible.answer_leads): the answer must not be buried under these. A lead
 *  that names the tool/process or its machinery instead of answering is
 *  narration — a genuine answer to the dev's question never mentions "tesser",
 *  the log, the pin, the digest, or the cold-run/classification scaffolding. */
const NARRATION = [
  /\btesser\b/i, // naming the tool/process in the lead, not the answer
  /\blog opened\b/i,
  /\bpinned at\b/i,
  /\bfound a (local )?digest\b/i,
  /\bself-update\b/i,
  /\bi have a validated digest\b/i,
  /^\s*(cold run|preflight)\b/i,
  /\bclassification\b/i,
];

/** Gap-surfacing language (CALIBRATED coverage map proxy). Rough by design;
 *  the coverage-map quality has an agent-judged tail per scoreboard.yaml. */
const GAP_LANGUAGE = [
  /could(n'?t| not) (run|verify|reach|access|execute|build)/i,
  /(needs?|requires?) a\b[^.]{0,40}\b(key|token|credential|password)/i,
  /did(n'?t| not) (verify|run|test|check|build|execute)/i,
  /(may be|might be|possibly) (stale|outdated|out of date|wrong)/i,
  /\bnot (verified|tested|confirmed|run)\b/i,
  /unable to (run|verify|reach|access|build)/i,
  /\bfrom (training|memory)\b/i,
  /without (running|executing|verifying|building)/i,
];

function fullOutput(view: SessionView): string {
  return view.assistantBlocks.map((b) => b.text).join("\n");
}

function countMatches(text: string, re: RegExp): number {
  const g = re.global ? re : new RegExp(re.source, re.flags + "g");
  return (text.match(g) ?? []).length;
}

// --- FASTER -----------------------------------------------------------------

export interface FasterScore {
  ttfaSeconds: number | null;
  method: "marker" | "250char";
  firstAnswerBlockIndex: number | null;
  firstAnswerChars: number;
  passesHardGate: boolean;
  meetsIdeal: boolean;
  note?: string;
}

export function scoreFaster(
  view: SessionView,
  role: Role,
  spec: ScoreboardSpec,
  questionTurn?: number,
): FasterScore {
  const qi = questionTurnIndex(view, questionTurn);
  const qTs = view.userTurns[qi]?.ts;
  const after = view.assistantBlocks
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => qTs && b.ts >= qTs);

  let hit: { b: SessionView["assistantBlocks"][number]; i: number } | undefined;
  let method: FasterScore["method"] = "250char";
  let note: string | undefined;

  if (role === "tesser" && spec.marker) {
    hit = after.find(({ b }) => spec.marker!.test(b.text));
    method = "marker";
  }
  if (!hit) {
    // Default's canonical rule, and tesser's fallback when no marker is found.
    hit = after.find(({ b }) => b.chars >= 250);
    method = "250char";
    if (role === "tesser") {
      note =
        "no first-answer marker found; fell back to the >=250-char rule, which " +
        "MISFIRES on tesser process-narration (scoreboard.yaml faster.baseline_rule). " +
        "Treat this TTFA as an upper-confidence ceiling, hand-verify if it gates a decision.";
    }
  }

  const ttfaSeconds =
    hit && qTs ? (hit.b.ts.getTime() - qTs.getTime()) / 1000 : null;
  return {
    ttfaSeconds,
    method,
    firstAnswerBlockIndex: hit?.i ?? null,
    firstAnswerChars: hit?.b.chars ?? 0,
    passesHardGate: ttfaSeconds !== null && ttfaSeconds <= spec.pass_max_seconds,
    meetsIdeal: ttfaSeconds !== null && ttfaSeconds <= spec.ideal_seconds,
    note,
  };
}

// --- DIGESTIBLE -------------------------------------------------------------

export interface DigestibleScore {
  lexiconLeakTotal: number;
  lexiconLeakTerms: Record<string, number>;
  citationMarkupFirstAnswer: number; // must be 0 (above-the-fold rule)
  citationMarkupTotal: number;
  firstAnswerChars: number;
  answerLeads: boolean;
  answerLeadsNote?: string;
}

export function scoreDigestible(
  view: SessionView,
  spec: ScoreboardSpec,
  faster: FasterScore,
): DigestibleScore {
  const full = fullOutput(view);

  // Lexicon leak (hard-0 gate): literal jargon terms, case-insensitive, over
  // the full human-facing output.
  const terms: Record<string, number> = {};
  let total = 0;
  for (const term of spec.lexicon) {
    const n = countMatches(
      full,
      new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
    );
    if (n > 0) {
      terms[term] = n;
      total += n;
    }
  }

  // Citation placement: raw markup in the first answer must be 0.
  const firstAnswer =
    faster.firstAnswerBlockIndex !== null
      ? view.assistantBlocks[faster.firstAnswerBlockIndex].text
      : "";
  const citationMarkupFirstAnswer = countMatches(firstAnswer, CITATION);
  const citationMarkupTotal = countMatches(full, CITATION);

  // Answer-leads: the first substantive (non-greeting) assistant block must be
  // the answer, not process narration.
  const firstSubstantive = view.assistantBlocks.find(
    (b) => !GREETING_ONLY.test(b.text.trim()),
  );
  const isNarration =
    !!firstSubstantive &&
    NARRATION.some((re) => re.test(firstSubstantive.text));
  return {
    lexiconLeakTotal: total,
    lexiconLeakTerms: terms,
    citationMarkupFirstAnswer,
    citationMarkupTotal,
    firstAnswerChars: faster.firstAnswerChars,
    answerLeads: !isNarration,
    answerLeadsNote: isNarration
      ? `first emission is process narration: ${JSON.stringify(
          firstSubstantive!.text.slice(0, 60),
        )}`
      : undefined,
  };
}

// --- CALIBRATED -------------------------------------------------------------

export interface CalibratedScore {
  provenanceCount: number; // Obligation A — checkable pointers attached
  gapsSurfaced: number; // coverage-map proxy (agent-judged quality tail)
  bScored: false;
  bNote: string;
}

export function scoreCalibrated(view: SessionView): CalibratedScore {
  const full = fullOutput(view);
  return {
    provenanceCount: countMatches(full, CITATION),
    gapsSurfaced: GAP_LANGUAGE.reduce((n, re) => n + countMatches(full, re), 0),
    bScored: false,
    bNote:
      "Obligation B (faithful confidence) has an agent-judged tail — not scored " +
      "deterministically (scoreboard.yaml axes.calibrated.deterministic). " +
      "RUN_EVAL judge: v1-deferred.",
  };
}

// --- combined ---------------------------------------------------------------

export interface SessionScore {
  sessionId: string;
  role: Role;
  questionTurnIndex: number;
  question: string;
  faster: FasterScore;
  digestible: DigestibleScore;
  calibrated: CalibratedScore;
}

export function scoreSession(
  jsonlPath: string,
  role: Role,
  opts: { questionTurn?: number; spec?: ScoreboardSpec } = {},
): SessionScore {
  const spec = opts.spec ?? loadScoreboard();
  const view = parseSession(jsonlPath);
  const qi = questionTurnIndex(view, opts.questionTurn);
  const faster = scoreFaster(view, role, spec, opts.questionTurn);
  return {
    sessionId: view.sessionId,
    role,
    questionTurnIndex: qi,
    question: view.userTurns[qi]?.text ?? "",
    faster,
    digestible: scoreDigestible(view, spec, faster),
    calibrated: scoreCalibrated(view),
  };
}

// --- win condition (pair) ---------------------------------------------------

export type AxisVerdict = "tesser-better" | "tie" | "tesser-worse";

export interface PairVerdict {
  faster: AxisVerdict;
  digestible: AxisVerdict;
  calibrated: AxisVerdict;
  coldTtfaNotWorse: boolean; // the hard gate
  win: boolean;
  reasons: string[];
}

function cmp(tesser: number, def: number, lowerIsBetter: boolean): AxisVerdict {
  const better = lowerIsBetter ? tesser < def : tesser > def;
  const worse = lowerIsBetter ? tesser > def : tesser < def;
  return better ? "tesser-better" : worse ? "tesser-worse" : "tie";
}

/** Combine sub-checks into one axis verdict: worse if ANY sub-check is worse,
 *  better if at least one is better and none worse, else tie. */
function combine(verdicts: AxisVerdict[]): AxisVerdict {
  if (verdicts.includes("tesser-worse")) return "tesser-worse";
  if (verdicts.includes("tesser-better")) return "tesser-better";
  return "tie";
}

export function scorePair(
  tesser: SessionScore,
  def: SessionScore,
): PairVerdict {
  const reasons: string[] = [];

  // FASTER: TTFA, lower is better.
  const fasterV = cmp(
    tesser.faster.ttfaSeconds ?? Infinity,
    def.faster.ttfaSeconds ?? Infinity,
    true,
  );
  reasons.push(
    `faster: tesser ${tesser.faster.ttfaSeconds?.toFixed(1)}s vs default ${def.faster.ttfaSeconds?.toFixed(1)}s → ${fasterV}`,
  );

  // DIGESTIBLE: lexicon leak, citation-in-first-answer, length, answer-leads.
  const dV = combine([
    cmp(tesser.digestible.lexiconLeakTotal, def.digestible.lexiconLeakTotal, true),
    cmp(
      tesser.digestible.citationMarkupFirstAnswer,
      def.digestible.citationMarkupFirstAnswer,
      true,
    ),
    cmp(tesser.digestible.firstAnswerChars, def.digestible.firstAnswerChars, true),
    cmp(
      tesser.digestible.answerLeads ? 1 : 0,
      def.digestible.answerLeads ? 1 : 0,
      false,
    ),
  ]);
  reasons.push(
    `digestible: leak ${tesser.digestible.lexiconLeakTotal}/${def.digestible.lexiconLeakTotal}, ` +
      `cite-in-lead ${tesser.digestible.citationMarkupFirstAnswer}/${def.digestible.citationMarkupFirstAnswer}, ` +
      `len ${tesser.digestible.firstAnswerChars}/${def.digestible.firstAnswerChars}, ` +
      `leads ${tesser.digestible.answerLeads}/${def.digestible.answerLeads} → ${dV}`,
  );

  // CALIBRATED: provenance (A) + gaps surfaced. B is not scored.
  const cV = combine([
    cmp(tesser.calibrated.provenanceCount, def.calibrated.provenanceCount, false),
    cmp(tesser.calibrated.gapsSurfaced, def.calibrated.gapsSurfaced, false),
  ]);
  reasons.push(
    `calibrated: provenance ${tesser.calibrated.provenanceCount}/${def.calibrated.provenanceCount}, ` +
      `gaps ${tesser.calibrated.gapsSurfaced}/${def.calibrated.gapsSurfaced} → ${cV} (B not scored)`,
  );

  const axes = [fasterV, dV, cV];
  const coldTtfaNotWorse = fasterV !== "tesser-worse" && tesser.faster.passesHardGate;
  const noWorse = !axes.includes("tesser-worse");
  const someBetter = axes.includes("tesser-better");
  const win = noWorse && someBetter && coldTtfaNotWorse;
  if (!coldTtfaNotWorse)
    reasons.push("HARD GATE: cold TTFA is worse than default or fails the ≤30s bar");
  return { faster: fasterV, digestible: dV, calibrated: cV, coldTtfaNotWorse, win, reasons };
}
