---
repo: https://github.com/acme/widget
sha: 0123456789abcdef0123456789abcdef01234567
commands:
  - cmd: make test
  - exit_code: 0
---

# Known-bad fixture digest

This digest is deliberately invalid: `env`, `ts`, `dependency_kind`, and
`truth_grade` are all missing, and both `commands` items are malformed
(the first has no exit_code, the second has no cmd). The filename's
library part and sha12 also do not match the frontmatter.

No citations here ⟦src/widget.py:L1-L4⟧ need a clone; this one is bare and
well-formed so the grammar check alone stays green on this file.
