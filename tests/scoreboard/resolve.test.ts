// Unit tests for session-id resolution. Hermetic: a tmp projects dir with
// fixture transcript files, never the real ~/.claude.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSession, defaultProjectsDir } from "./resolve.ts";

let root: string;
let projects: string;
const A = "db8e01b9-4321-4e13-8d03-707cc6af152e";
const B = "617bdfbb-c4df-4068-811d-543854db6ab0";
const C = "db00ffff-0000-0000-0000-000000000000"; // shares the "db" prefix with A

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "tesser-resolve-"));
  projects = join(root, "projects");
  mkdirSync(join(projects, "-proj-with"), { recursive: true });
  mkdirSync(join(projects, "-proj-without"), { recursive: true });
  writeFileSync(join(projects, "-proj-with", `${A}.jsonl`), "{}\n");
  writeFileSync(join(projects, "-proj-without", `${B}.jsonl`), "{}\n");
  writeFileSync(join(projects, "-proj-with", `${C}.jsonl`), "{}\n");
});

afterAll(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("resolveSession", () => {
  it("resolves a full UUID to its transcript under a per-project subdir", () => {
    expect(resolveSession(A, projects)).toBe(join(projects, "-proj-with", `${A}.jsonl`));
  });

  it("resolves an unambiguous short prefix", () => {
    expect(resolveSession("617bdfbb", projects)).toBe(
      join(projects, "-proj-without", `${B}.jsonl`)
    );
  });

  it("accepts a <uuid>.jsonl filename (strips the extension)", () => {
    expect(resolveSession(`${B}.jsonl`, projects)).toBe(
      join(projects, "-proj-without", `${B}.jsonl`)
    );
  });

  it("uses an existing file path verbatim (back-compat), ignoring projectsDir", () => {
    const p = join(projects, "-proj-with", `${A}.jsonl`);
    expect(resolveSession(p, join(root, "does-not-exist"))).toBe(p);
  });

  it("throws on an ambiguous prefix and lists the candidates", () => {
    expect(() => resolveSession("db", projects)).toThrow(/ambiguous session id "db" — 2 matches/);
  });

  it("throws on no match", () => {
    expect(() => resolveSession("zzzznope", projects)).toThrow(/no session transcript found/);
  });

  it("throws a helpful error when the projects dir is absent", () => {
    expect(() => resolveSession("db8e01b9", join(root, "nope"))).toThrow(
      /projects dir does not exist/
    );
  });
});

describe("defaultProjectsDir", () => {
  it("honors CLAUDE_PROJECTS_DIR when set", () => {
    const prev = process.env.CLAUDE_PROJECTS_DIR;
    process.env.CLAUDE_PROJECTS_DIR = "/tmp/custom-projects";
    try {
      expect(defaultProjectsDir()).toBe("/tmp/custom-projects");
    } finally {
      if (prev === undefined) delete process.env.CLAUDE_PROJECTS_DIR;
      else process.env.CLAUDE_PROJECTS_DIR = prev;
    }
  });

  it("falls back to ~/.claude/projects", () => {
    const prev = process.env.CLAUDE_PROJECTS_DIR;
    delete process.env.CLAUDE_PROJECTS_DIR;
    try {
      expect(defaultProjectsDir()).toMatch(/[/\\]\.claude[/\\]projects$/);
    } finally {
      if (prev !== undefined) process.env.CLAUDE_PROJECTS_DIR = prev;
    }
  });
});
