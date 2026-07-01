// Type-A gate for tesser-review/check.py — the self-containment iron contract.
// check.py is stdlib-only python3 (no venv), so we spawn it via `python3`
// directly (the same way SKILL.md invokes it) rather than relying on +x.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const checkPy = path.join(repoRoot, "tesser-review", "check.py");
const example = path.join(repoRoot, "tesser-review", "example-comparison.html");

let tmp: string;
let n = 0;

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tr-check-"));
});
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function run(htmlPath: string) {
  const res = spawnSync("python3", [checkPy, htmlPath], { encoding: "utf8" });
  if (res.error) throw res.error;
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}
function write(html: string): string {
  const p = path.join(tmp, `case-${n++}.html`);
  fs.writeFileSync(p, html);
  return p;
}

describe("tesser-review/check.py — self-containment gate", () => {
  it("the bundled example-comparison.html is self-contained (exit 0)", () => {
    const { status, stderr } = run(example);
    expect(status, stderr).toBe(0);
  });

  it("a CDN <script src> is rejected (exit 1)", () => {
    const p = write(
      `<!doctype html><html><head><script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script></head><body>hi</body></html>`,
    );
    const { status, stderr } = run(p);
    expect(status).toBe(1);
    expect(stderr).toMatch(/external resource/);
    expect(stderr).toMatch(/cdn\.jsdelivr/);
  });

  it('a sibling asset (<img src="x.svg">, the grounding-flow case) is rejected (exit 1)', () => {
    const p = write(`<!doctype html><html><body><img src="grounding-flow.svg"></body></html>`);
    expect(run(p).status).toBe(1);
  });

  it("an external <link rel=stylesheet> is rejected (exit 1)", () => {
    const p = write(
      `<!doctype html><html><head><link rel="stylesheet" href="/styles/app.css"></head><body></body></html>`,
    );
    expect(run(p).status).toBe(1);
  });

  it("an external CSS @import is rejected (exit 1)", () => {
    const p = write(
      `<!doctype html><html><head><style>@import "https://fonts.example/x.css";</style></head><body></body></html>`,
    );
    expect(run(p).status).toBe(1);
  });

  it("inline data: URIs and navigational <a href> links are allowed (exit 0)", () => {
    const p = write(
      `<!doctype html><html><body><img src="data:image/png;base64,AAAA"><a href="https://example.com">docs</a><a href="#top">top</a></body></html>`,
    );
    const { status, stderr } = run(p);
    expect(status, stderr).toBe(0);
  });

  it("no argument is a usage error (exit 2)", () => {
    const res = spawnSync("python3", [checkPy], { encoding: "utf8" });
    expect(res.status).toBe(2);
  });
});
