#!/usr/bin/env python3
"""
Extract every <iframe id="iframe-X" srcdoc="..."> game into games/<X>.html
and rewrite the iframe to load via src=.

Robust & provably-correct strategy: iframe elements cannot nest, and the
source has exactly 11 <iframe> ... 11 </iframe> with no internal </iframe>.
So for each <iframe> the FIRST following </iframe> is its true close. We then
peel the closing attributes (allowfullscreen, sandbox) off the end to find the
srcdoc value's closing quote. This cannot cross game boundaries.
"""
import re
import html
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, "index.html")
GAMES_DIR = os.path.join(ROOT, "games")
os.makedirs(GAMES_DIR, exist_ok=True)

with open(INDEX, "r", encoding="utf-8") as f:
    text = f.read()

opens = [m.start() for m in re.finditer(r"<iframe", text)]
closes = [m.start() for m in re.finditer(r"</iframe>", text)]

# Greedy pair each open with the next unused close.
used = set()
pairs = []
for o in opens:
    nxt = next((c for c in closes if c > o and c not in used), None)
    if nxt is None:
        raise SystemExit(f"No closing </iframe> for iframe at {o}")
    used.add(nxt)
    pairs.append((o, nxt))

out_pieces = []
cursor = 0
extracted = []

for o, c in pairs:
    # copy untouched text before this iframe
    out_pieces.append(text[cursor:o])
    element = text[o : c + len("</iframe>")]
    cursor = c + len("</iframe>")

    mname = re.search(r'id="iframe-([a-zA-Z0-9_]+)"', element)
    if not mname:
        out_pieces.append(element)  # not a game iframe; leave as-is
        continue
    name = mname.group(1)

    sd = element.find('srcdoc="')
    if sd == -1:
        # iframe already uses src= (e.g. eaglercraft). leave as-is.
        out_pieces.append(element)
        continue
    content_start = sd + len('srcdoc="')

    rest = element[content_start:]              # CONTENT + '"' + tail + (/&gt;)></iframe>
    idx = rest.rfind("</iframe>")
    assert idx != -1, f"{name}: no </iframe> tail"
    rest = rest[:idx].rstrip()
    # closing '>' may be literal '>' or escaped '&gt;'
    if rest.endswith("&gt;"):
        rest = rest[:-4].rstrip()
    elif rest.endswith(">"):
        rest = rest[:-1].rstrip()
    rest = rest.rstrip()
    allowfs = ""
    if rest.endswith("allowfullscreen"):
        allowfs = " allowfullscreen"
        rest = rest[: -len("allowfullscreen")].rstrip()
    sb = re.search(r' sandbox=(?:"[^"]*"|&quot;[^&]*&quot;)$', rest)
    sandbox_attr = ""
    if sb:
        sandbox_attr = sb.group(0)              # includes leading space
        rest = rest[: sb.start()]
    # srcdoc closing quote may be literal '"' or escaped '&quot;'
    if rest.endswith("&quot;"):
        content = rest[:-6]
    elif rest.endswith('"'):
        content = rest[:-1]
    else:
        raise SystemExit(f"{name}: could not locate srcdoc closing quote. tail={rest[-80:]!r}")
    decoded = html.unescape(content)

    out_path = os.path.join(GAMES_DIR, f"{name}.html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(decoded)
    extracted.append(name)

    # opening tag text up to (not including) srcdoc="
    opening = element[:sd]
    new_iframe = f'{opening}src="games/{name}.html"{sandbox_attr}{allowfs}></iframe>'
    out_pieces.append(new_iframe)
    print(f"  {name:14s} srcdoc={len(content):7d}b -> games/{name}.html")

out_pieces.append(text[cursor:])
new_text = "".join(out_pieces)

with open(INDEX, "w", encoding="utf-8") as f:
    f.write(new_text)

print(f"\nExtracted {len(extracted)} games: {', '.join(extracted)}")
print(f"index.html: {text.count(chr(10))} -> {new_text.count(chr(10))} lines")
print(f"srcdoc= remaining: {new_text.count('srcdoc=')}")
