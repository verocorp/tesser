// CALIBRATED Obligation B — the quality rubric the LLM-judge applies.
//
// This is the taste-bearing quality definition (Chris's principles, made
// explicit), drawn from the 2026-06-13 dogfood review. The judge grades a
// PRODUCED tesser answer against the 8 principles, and — per the YC paper-club
// "never trust yourself in these ways" method (targeted, enumerated, structural,
// NOT global distrust) — corrects for its OWN known failure modes via the
// KNOWN_FAILURE_MODES block rather than a generic "be skeptical" line.
//
// Spec-as-data: the runner + calibrated-b.test.ts read these; change them only
// as a deliberate quality-bar decision.

export interface Principle {
  n: number;
  name: string;
  test: string;
}

export const PRINCIPLES: Principle[] = [
  { n: 1, name: "answer-first", test: "Leads with the answer (what it does → how it works → how to set up), not process/method narration. Penalize any 'I'll use the X skill', 'I built it from source at commit Y', or machinery preamble before the answer." },
  { n: 2, name: "right-sized length", test: "Tight enough a busy dev won't glaze over. An overview question wants ~4 short paragraphs of substance. Penalize wall-of-text, repetition, and detail past what was asked." },
  { n: 3, name: "plain language", test: "No internal tooling jargon (run-grade, inspect-grade, digest, cold run, provisional) and no implementation status the dev doesn't care about ('cached this analysis', 'Log ID', clone bookkeeping, '~/.tesser holds N clones')." },
  { n: 4, name: "right-sized calibration", test: "Real authority/staleness caveats where they matter (e.g. 'this is a personal fork, upstream is X'; 'couldn't verify Y') are GOOD. Penalize overblown technical hedging the dev didn't ask for at overview altitude — repeated run-vs-read disclaimers, exact-detail flags whose truth wouldn't change the overview." },
  { n: 5, name: "no overclaim", test: "Flag any absolute/superlative that overstates ('instant', 'guaranteed', 'seamless', 'will be instant')." },
  { n: 6, name: "do/don't-for-me", test: "Says what it does FOR the dev AND what it does NOT do / its limits ('reasoning is delegated, not magic; the model still has to pick the algorithm')." },
  { n: 7, name: "mental-model mapping", test: "Relates it to known things ('like X but for Y') so the dev can place it against what they already know." },
  { n: 8, name: "JTBD close", test: "Ends with what we know / what we still don't know / where to go next, and the offered next steps name SPECIFIC developer jobs they might want (e.g. 'want the list of all 49 tools and what each does?'), NOT vague implementation tasks ('verify a tool end-to-end')." },
];

export interface FailureMode {
  mode: string;
  correction: string;
}

// "Never trust yourself in THESE ways" — the judge's own training-shaped biases,
// each with a structural correction. Targeted + enumerated, never global (a
// judge that distrusts everything is the trustworthy-but-useless cry-wolf).
export const KNOWN_FAILURE_MODES: FailureMode[] = [
  { mode: "Leniency / sycophancy: rating polished, fluent prose as PASS because it reads well.", correction: "A PASS is only earned by the text MEETING the principle, never by being well-written. If you can quote a violation, it is not a PASS. Bias toward naming the weakest principle explicitly." },
  { mode: "Eloquence / length bias: treating a long, thorough answer as a better one.", correction: "Length is a COST here (principle 2). A longer answer is worse, not better, unless the question needed the depth. Reward concision." },
  { mode: "Gestalt over evidence: scoring on overall impression.", correction: "Every verdict MUST carry a short quoted span from the answer as evidence. No quote → you have not judged it." },
  { mode: "Inconsistency: grading the same pattern differently across answers.", correction: "Apply each principle's test literally and identically. State the rule you applied, not how you feel about this answer." },
];

/** Build the judge prompt for one produced answer. */
export function buildJudgePrompt(answer: string): string {
  const rubric = PRINCIPLES.map((p) => `${p.n}. ${p.name.toUpperCase()} — ${p.test}`).join("\n");
  const failures = KNOWN_FAILURE_MODES.map(
    (f, i) => `${i + 1}. ${f.mode}\n   CORRECT FOR IT: ${f.correction}`
  ).join("\n");
  return [
    "You are a strict quality judge for developer-facing answers about software dependencies.",
    "The developer is busy and wants to quickly understand an unfamiliar dependency and place",
    "it in their mental model. Judge ONLY the answer text below, against the rubric.",
    "",
    "RUBRIC — score each PASS / PARTIAL / FAIL with one short quoted span as evidence:",
    rubric,
    "",
    "KNOWN_FAILURE_MODES — these are YOUR reliable biases as an LLM judge. Correct for each;",
    "do NOT generalize this into distrusting everything (that makes you useless):",
    failures,
    "",
    "OUTPUT — return ONLY:",
    "1. a markdown table: | # | Principle | Verdict | Evidence (quote) | Why |",
    "2. a line 'WEAKEST PRINCIPLE: <n — name>' (you must name one, even if the answer is strong)",
    "3. a line 'BIGGEST PROBLEM a busy dev would have:'",
    "4. a line 'WHAT'S MISSING:'",
    "",
    "=== ANSWER UNDER JUDGMENT ===",
    answer,
  ].join("\n");
}
