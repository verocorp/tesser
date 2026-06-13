// tesser scoreboard scorer (T7) — session-id resolution.
//
// The CLI accepts a session id (the UUID `claude` shows you, or a short prefix)
// instead of a full transcript path. This module maps that id to the `.jsonl`
// under ~/.claude/projects/**. Pure (no printing) so it is unit-testable; the
// CLI owns the user-facing "[resolved]" line.

import { existsSync, statSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";

/** Default per-project session store; override via CLAUDE_PROJECTS_DIR. */
export function defaultProjectsDir(): string {
  return process.env.CLAUDE_PROJECTS_DIR ?? join(homedir(), ".claude", "projects");
}

/**
 * Resolve a SESSION argument to a transcript path. Order:
 *   1. an existing file path (explicit path / `<id>.jsonl` in cwd) — used as-is;
 *   2. otherwise a session id (full UUID or prefix), found under projectsDir by
 *      matching `<id>*.jsonl` on the basename across all per-project subdirs.
 * Throws on a missing projects dir, no match, or an ambiguous prefix (the error
 * lists the candidates).
 */
export function resolveSession(arg: string, projectsDir: string): string {
  if (existsSync(arg) && statSync(arg).isFile()) return arg;
  const id = arg.replace(/\.jsonl$/, "");
  if (!existsSync(projectsDir)) {
    throw new Error(
      `"${arg}" is not a file and the projects dir does not exist: ${projectsDir}\n` +
        `  pass a path, or set --projects-dir / CLAUDE_PROJECTS_DIR.`
    );
  }
  const matches = (readdirSync(projectsDir, { recursive: true }) as string[]).filter(
    (f) => {
      const base = f.split(sep).pop() ?? "";
      return base.endsWith(".jsonl") && base.startsWith(id);
    }
  );
  if (matches.length === 0) {
    throw new Error(`no session transcript found for id "${id}" under ${projectsDir}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `ambiguous session id "${id}" — ${matches.length} matches under ${projectsDir}:\n` +
        matches.map((m) => `  ${m}`).join("\n") +
        `\n  use a longer prefix.`
    );
  }
  return join(projectsDir, matches[0]);
}
