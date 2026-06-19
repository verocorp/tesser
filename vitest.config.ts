import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    // The skill is installed by symlinking `.claude/skills/tesser` back to this
    // repo (so Claude Code discovers it). Without this exclude, vitest globs the
    // symlinked copy too and runs every test file twice — once at `tests/`, once
    // at `.claude/skills/tesser/tests/` — silently DOUBLING the reported count
    // (e.g. 263 real tests reported as 526). The count is a calibration surface
    // for this project; an inflated number is exactly the overclaim it exists to
    // avoid. Keep the symlink out of the test glob.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
});
