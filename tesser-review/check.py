#!/usr/bin/env python3
"""tesser-review self-containment gate (the iron contract).

A tesser-review artifact is ONE self-contained HTML file: it must load no
external resource — no CDN script/style, no sibling `.svg`/`.js`/`.css`, no
remote image or font. That is the property that makes a review portable and
honest; two of the six surveyed artifacts violated it (a sibling `.svg`, a
jsdelivr CDN), so this is a deliberate policy, enforced before a review is
shown. Navigational `<a href>` links are fine — only *loaded* resources break
self-containment.

Stdlib only (no venv): runs anywhere python3 does.

Usage:  check.py <review.html>
Exit:   0 self-contained · 1 external reference(s) found · 2 usage/unreadable
"""

import re
import sys
from html.parser import HTMLParser

# tag -> the attribute that LOADS an external resource (not navigation).
RESOURCE_ATTRS = {
    "script": "src", "link": "href", "img": "src", "audio": "src",
    "video": "src", "source": "src", "track": "src", "iframe": "src",
    "embed": "src", "object": "data", "input": "src",  # input type=image
}


def is_external(value):
    """External unless it is an inline data: URI, a bare #fragment, or empty.
    Everything else — http(s)://, //host, or ANY relative/absolute file path —
    means the document pulls something from outside itself."""
    if not value:
        return False
    v = value.strip()
    if not v or v.startswith("#"):
        return False
    return not v.lower().startswith("data:")


class ResourceFinder(HTMLParser):
    def __init__(self):
        super().__init__()
        self.violations = []  # (line, tag, attr, value)

    def handle_starttag(self, tag, attrs):
        attr = RESOURCE_ATTRS.get(tag)
        if attr is None:
            return
        val = dict(attrs).get(attr)
        if is_external(val):
            self.violations.append((self.getpos()[0], tag, attr, val))


_CSS_URL = re.compile(r"""url\(\s*['"]?([^'")]+)['"]?\s*\)""", re.IGNORECASE)
_CSS_IMPORT = re.compile(r"""@import\s+(?:url\()?\s*['"]([^'"]+)['"]""", re.IGNORECASE)


def _css_externals(text):
    out = []
    for rx, label in ((_CSS_URL, "url()"), (_CSS_IMPORT, "@import")):
        for m in rx.finditer(text):
            if is_external(m.group(1)):
                out.append((text.count("\n", 0, m.start()) + 1, "css", label, m.group(1)))
    return out


def main(argv):
    if len(argv) != 2:
        sys.stderr.write("usage: check.py <review.html>\n")
        return 2
    path = argv[1]
    try:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
    except UnicodeDecodeError as e:
        sys.stderr.write(f"INVALID: {path} is not valid UTF-8: {e}\n")
        return 1
    except OSError as e:
        sys.stderr.write(f"check.py: cannot read {path}: {e}\n")
        return 2

    finder = ResourceFinder()
    finder.feed(text)
    violations = sorted(finder.violations + _css_externals(text))
    for line, tag, attr, val in violations:
        sys.stderr.write(
            f'INVALID: external resource at line {line}: <{tag} {attr}="{val}"> — '
            "a tesser-review artifact must inline everything (no CDN, no sibling files)\n"
        )
    if violations:
        return 1
    print(f"OK: self-contained ({len(text)} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
