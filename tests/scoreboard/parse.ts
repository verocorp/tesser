// tesser scoreboard scorer (T7) — session JSONL parser.
//
// Reads a Claude Code session transcript (the *.jsonl under
// ~/.claude/projects/<slug>/) into a normalized view the axis scorers
// consume. NOTHING here interprets quality — this layer only extracts the
// observable timeline (who spoke when, and the assistant's human-facing text).
//
// Validated against real sessions: parsing pyyaml-default 617bdfbb and taking
// the first >=250-char assistant block after the question turn reproduces the
// published TTFA of 19.6s and 3248-char first answer exactly (scoreboard-
// results.md). That match is the parser's correctness anchor.

import { readFileSync } from "node:fs";

/** One human-facing assistant text emission (a single text block, in order). */
export interface AssistantBlock {
  ts: Date;
  text: string;
  chars: number;
}

export interface UserTurn {
  ts: Date;
  text: string;
}

/** One thing the developer SAW scroll past, in display order: an assistant text
 *  block, or a tool call (the Bash/clone/grep/Read block). The judge needs both
 *  — "bash, bash, answer, bash" is the experience, and the machinery around the
 *  answer is exactly what the dogfood flagged; grading prose alone hides it. */
export interface DisplayEvent {
  ts: Date;
  kind: "text" | "tool";
  /** For text: the block. For tool: a compact one-line marker (e.g. `$ git clone …`). */
  text: string;
}

export interface SessionView {
  sessionId: string;
  /** Every user turn, in order, with its text flattened to a string. */
  userTurns: UserTurn[];
  /** Every non-empty assistant text block, in order. Tool-use/-result blocks
   *  are excluded: they are not what the human reads. */
  assistantBlocks: AssistantBlock[];
  /** Text + tool calls interleaved in display order — the real scrollback. */
  displayEvents: DisplayEvent[];
}

/** Compact one-line marker for a tool_use block, as a reviewer would skim it. */
function summarizeTool(b: { name?: string; input?: Record<string, unknown> }): string {
  const name = b.name ?? "tool";
  const inp = b.input ?? {};
  const oneLine = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
  if (name === "Bash") return `$ ${oneLine(inp.command).slice(0, 100)}`;
  const hint =
    inp.description ?? inp.file_path ?? inp.path ?? inp.pattern ?? inp.prompt ?? inp.url ?? "";
  const h = oneLine(hint).slice(0, 80);
  return h ? `${name}: ${h}` : name;
}

/** Flatten a message `content` (string | block[]) to its plain text. */
function flattenText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (b): b is { type: string; text?: string } =>
          !!b && typeof b === "object" && (b as { type?: string }).type === "text",
      )
      .map((b) => b.text ?? "")
      .join("");
  }
  return "";
}

function parseTs(o: { timestamp?: string }): Date | null {
  return o.timestamp ? new Date(o.timestamp) : null;
}

/** Parse a session JSONL file into the normalized view. */
export function parseSession(jsonlPath: string): SessionView {
  const lines = readFileSync(jsonlPath, "utf8").split("\n");
  const userTurns: UserTurn[] = [];
  const assistantBlocks: AssistantBlock[] = [];
  const displayEvents: DisplayEvent[] = [];
  let sessionId = "";

  for (const line of lines) {
    if (line.trim() === "") continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(line);
    } catch {
      continue; // tolerate a truncated trailing line
    }
    if (typeof o.sessionId === "string" && !sessionId) sessionId = o.sessionId;

    const type = o.type;
    const message = o.message as { role?: string; content?: unknown } | undefined;
    if (type === "user" && message) {
      const ts = parseTs(o as { timestamp?: string });
      const text = flattenText(message.content);
      if (ts) userTurns.push({ ts, text });
    } else if (type === "assistant" && message) {
      const ts = parseTs(o as { timestamp?: string });
      if (!ts) continue;
      const text = flattenText(message.content);
      if (text.trim() !== "") {
        assistantBlocks.push({ ts, text, chars: text.length });
      }
      // Walk the content array in display order so text and tool calls interleave
      // exactly as they scrolled past the developer.
      if (Array.isArray(message.content)) {
        for (const b of message.content as Array<{ type?: string; text?: string; name?: string; input?: Record<string, unknown> }>) {
          if (b?.type === "text" && (b.text ?? "").trim() !== "") {
            displayEvents.push({ ts, kind: "text", text: b.text as string });
          } else if (b?.type === "tool_use") {
            displayEvents.push({ ts, kind: "tool", text: summarizeTool(b) });
          }
        }
      } else if (typeof message.content === "string" && message.content.trim() !== "") {
        displayEvents.push({ ts, kind: "text", text: message.content });
      }
    }
  }

  return { sessionId, userTurns, assistantBlocks, displayEvents };
}

/** One developer-facing turn: the question the dev asked and the assistant's
 *  full reply to it (narration included), exactly as the dev read it. */
export interface AnswerTurn {
  /** The developer's question that opened this turn (flattened, trimmed). */
  question: string;
  /** Every assistant text block in this turn joined in order — the lead the
   *  developer actually saw, method narration and all. */
  answer: string;
  /** The turn as the developer SAW it: text + tool calls interleaved in order,
   *  tool calls rendered as `⟨tool $ …⟩`. This is what the judge grades — the
   *  machinery bracketing the answer is visible, not stripped. */
  rendered: string;
  /** Tool calls before the first text block in this turn (the "bash at the
   *  start" the dogfood flagged). */
  toolLeadCount: number;
  /** Total tool calls visible in this turn. */
  toolCount: number;
  /** The assistant text blocks in this turn, in order. */
  blocks: AssistantBlock[];
}

/**
 * User turns the HARNESS injects, not text the developer typed: the skill-load
 * boilerplate, slash-command wrappers, background-task notifications, and
 * local-command stdout. They must not start a new "answer" — the assistant text
 * that follows them belongs to the developer's last real question (e.g. an
 * "I'll use the X skill" stub + the skill's substantive answer are ONE answer).
 */
function isInjectedTurn(text: string): boolean {
  const t = text.trimStart();
  return (
    t.startsWith("Base directory for this skill:") ||
    t.startsWith("<task-notification>") ||
    t.startsWith("[SYSTEM NOTIFICATION") ||
    t.includes("<command-name>") ||
    t.includes("<command-message>") ||
    t.includes("<command-args>") ||
    t.includes("<local-command-stdout>") ||
    t.includes("[SYSTEM NOTIFICATION - NOT USER INPUT]")
  );
}

/**
 * A `/skill <args>` invocation carries the developer's REAL question in
 * `<command-args>` (the wrapper turn) and again after `ARGUMENTS:` (the
 * skill-expansion turn). Both look "injected" but the question is theirs — pull
 * it so a `/tesser <question>` session is graded against the question, not
 * dropped as boilerplate (the "no gradable answer turns" failure). Returns null
 * for a plain `claude -p` turn (which already IS the question).
 */
function extractInvokedQuestion(text: string): string | null {
  const m = text.match(/<command-args>([\s\S]*?)<\/command-args>/);
  if (m && m[1].trim()) return m[1].trim();
  if (/\bARGUMENTS:/.test(text)) {
    const tail = text.split(/\bARGUMENTS:[ \t]*/).pop()?.trim();
    if (tail) return tail;
  }
  return null;
}

/**
 * Segment the session into (question → answer) turns from the primary question
 * onward. A "question" is a REAL human user turn — tool-result turns flatten to
 * "" and are skipped, so they don't create spurious boundaries. A `/tesser
 * <question>` invocation IS a question turn (the args are extracted), and the
 * wrapper + skill-expansion pair that carry the same args are deduped to one.
 * Each answer is every assistant text block between that question and the next
 * human turn, in order, with the narration lead KEPT: the judge must evaluate
 * what the dev read (an "I'll use the X skill" opener is a principle-1
 * violation, not preamble to strip). One turn for an overview, several for a
 * deep dive — never one blob.
 */
export function answerTurns(view: SessionView, override?: number): AnswerTurn[] {
  const qi = questionTurnIndex(view, override);
  const startTs = view.userTurns[qi]?.ts;
  const questions: { ts: Date; text: string }[] = [];
  for (const t of view.userTurns) {
    if (t.text.trim() === "" || (startTs && t.ts < startTs)) continue;
    const invoked = extractInvokedQuestion(t.text);
    const text = invoked ?? (isInjectedTurn(t.text) ? null : t.text.trim());
    if (!text) continue;
    // Dedupe the wrapper turn + the skill-expansion turn (same args, back to back).
    if (questions.length && questions[questions.length - 1].text === text) continue;
    questions.push({ ts: t.ts, text });
  }
  const turns: AnswerTurn[] = [];
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const nextTs = questions[i + 1]?.ts;
    const inWindow = (ts: Date) => ts >= q.ts && (!nextTs || ts < nextTs);
    const blocks = view.assistantBlocks.filter((b) => inWindow(b.ts));
    if (blocks.length === 0) continue;
    const events = view.displayEvents.filter((e) => inWindow(e.ts));
    const firstTextIdx = events.findIndex((e) => e.kind === "text");
    const toolLeadCount = events
      .slice(0, firstTextIdx < 0 ? events.length : firstTextIdx)
      .filter((e) => e.kind === "tool").length;
    turns.push({
      question: q.text.trim(),
      answer: blocks.map((b) => b.text).join("\n\n"),
      rendered: events
        .map((e) => (e.kind === "tool" ? `    ⟨tool ${e.text}⟩` : e.text))
        .join("\n\n"),
      toolLeadCount,
      toolCount: events.filter((e) => e.kind === "tool").length,
      blocks,
    });
  }
  return turns;
}

/** Greeting turns that should not be mistaken for "the question". */
const GREETING = /^(hi|hey|hello|yo|sup|good (morning|afternoon|evening))\b/i;

/**
 * Pick the index of the user turn that is "the question" being scored.
 *
 * Default rule: the first user turn that is not a short bare greeting. This
 * handles the common "hi" → real-question opener (e.g. pyyaml-default 617bdfbb,
 * where turn 0 is "hi" and turn 1 is the question). A caller can override with
 * an explicit index when a session's shape is unusual.
 */
export function questionTurnIndex(view: SessionView, override?: number): number {
  if (override !== undefined) return override;
  for (let i = 0; i < view.userTurns.length; i++) {
    const t = view.userTurns[i].text.trim();
    if (t.length >= 20 || !GREETING.test(t)) return i;
  }
  return 0;
}
