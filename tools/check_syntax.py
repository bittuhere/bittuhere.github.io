#!/usr/bin/env python3
"""
Syntax-check every inline <script> in index.html and games/*.html using
`node --check`. Reports the file, script index, and the offending snippet.
This is the audit tool for the "fix all syntax errors" requirement.
"""
import re
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SCRIPT_RE = re.compile(
    r'<script(?![^>]*\bsrc=)(?![^>]*\btype="application/(?:ld\+json|json)")[^>]*>(.*?)</script>',
    re.DOTALL | re.IGNORECASE,
)

targets = [os.path.join(ROOT, "index.html")]
for f in sorted(os.listdir(os.path.join(ROOT, "games"))):
    if f.endswith(".html"):
        targets.append(os.path.join(ROOT, "games", f))

total_errors = 0
total_scripts = 0

for path in targets:
    rel = os.path.relpath(path, ROOT)
    with open(path, "r", encoding="utf-8") as fh:
        html = fh.read()
    blocks = SCRIPT_RE.findall(html)
    for i, code in enumerate(blocks):
        if not code.strip():
            continue
        total_scripts += 1
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as tmp:
            tmp.write(code)
            tmp_path = tmp.name
        try:
            subprocess.run(["node", "--check", tmp_path], check=True,
                           stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        except subprocess.CalledProcessError as e:
            total_errors += 1
            err = e.stderr.decode("utf-8", "replace") if e.stderr else "unknown"
            first_line = code.strip().splitlines()[0][:60] if code.strip() else ""
            print(f"\n❌ {rel}  [script #{i}]  starts: {first_line!r}")
            for line in err.splitlines()[:3]:
                print(f"    {line}")
        finally:
            os.unlink(tmp_path)

print(f"\n{'='*50}")
print(f"Checked {total_scripts} inline scripts across {len(targets)} files.")
if total_errors == 0:
    print("✅ All scripts pass syntax check.")
else:
    print(f"❌ {total_errors} script(s) with syntax errors.")
sys.exit(1 if total_errors else 0)
