// tesser-finalize/finalize is a thin shim: the companion skill installs beside
// the main tesser skill, so a bare `scripts/finalize` in its SKILL.md resolves
// against the companion's OWN dir (no scripts/ there) — the bug that left
// /tesser-finalize broken while undiscoverable. The shim resolves the real
// scripts/finalize from its own realpath and forwards. Pin that it forwards.

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const shim = path.join(repoRoot, "tesser-finalize", "finalize");

describe("tesser-finalize/finalize — forwards to scripts/finalize", () => {
  it("reaches the real finalize (its argparse errors), not the shim's not-found path", () => {
    const res = spawnSync("python3", [shim], { encoding: "utf8" });
    // The real finalize requires --digest/--question/--dependency-kind → argparse
    // usage error, exit 2. Seeing that proves the shim resolved and forwarded.
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/--digest/);
    expect(res.stderr).not.toMatch(/cannot find the tesser scripts/);
  });

  it("passes arguments through to the real finalize", () => {
    // A bad anchor combination is rejected by the REAL finalize's own guard,
    // not by the shim — confirming argv is forwarded intact.
    const res = spawnSync(
      "python3",
      [shim, "--digest", "/nope.md", "--question", "q", "--dependency-kind", "hosted-closed",
        "--provider", "x/y", "--repo", "https://github.com/x/y"],
      { encoding: "utf8" },
    );
    expect(res.status).toBe(2);
    expect(res.stderr).toMatch(/mutually exclusive|no such digest file/);
  });
});
