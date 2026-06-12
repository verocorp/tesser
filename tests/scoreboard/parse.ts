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

export interface SessionView {
  sessionId: string;
  /** Every user turn, in order, with its text flattened to a string. */
  userTurns: UserTurn[];
  /** Every non-empty assistant text block, in order. Tool-use/-result blocks
   *  are excluded: they are not what the human reads. */
  assistantBlocks: AssistantBlock[];
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
      const text = flattenText(message.content);
      if (ts && text.trim() !== "") {
        assistantBlocks.push({ ts, text, chars: text.length });
      }
    }
  }

  return { sessionId, userTurns, assistantBlocks };
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
