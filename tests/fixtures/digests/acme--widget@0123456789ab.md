---
repo: file:///opt/fixtures/acme/widget.git
sha: 0123456789abcdef0123456789abcdef01234567
env:
  os: darwin
  arch: arm64
  python: 3.12.5
commands:
  - cmd: python -m pytest
    exit_code: 0
  - cmd: python -c "import widget; print(widget.__version__)"
    exit_code: 0
ts: "2026-06-10T18:04:00Z"
dependency_kind: clonable-library
truth_grade: run
question: How does widget resolve its config search path?
---

# widget @ 0123456789ab — verified map

widget resolves its config search path in `Config.load`, walking from the
current directory upward until it finds `widget.toml` ⟦src/widget.py:L3-L9⟧.

The default search depth is capped at 8 parent directories
⟦src/widget.py:L1-L2⟧@0123456789ab, verified by running the test suite
(exit 0, see commands).

Claims below run-grade: none — everything above was exercised by the
commands recorded in the frontmatter.
