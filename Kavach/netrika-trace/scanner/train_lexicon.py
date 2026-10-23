"""Build scanner/rules/lexicon.json from locally installed text.

Corpus (nothing downloaded): README/LICENSE-style prose under the Python
site-packages and frontend node_modules trees, docstrings and comments of the
Python standard library and installed packages, plus scanner/data/extra_words.txt.

Output:
  words    ranked dictionary (lowercase words, len 3-24)
  uni/bi/tri  character counts for the interpolated trigram language model
"""

import ast
import collections
import json
import pathlib
import re
import sys
import sysconfig

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "scanner" / "rules" / "lexicon.json"
WORD = re.compile(r"[A-Za-z]{3,24}")
CAMEL = re.compile(r"[A-Z]?[a-z]+|[A-Z]+(?![a-z])")
MAX_FILES = 6000


def prose_files():
    roots = [pathlib.Path(sysconfig.get_paths()["purelib"]), ROOT / "frontend" / "node_modules"]
    n = 0
    for base in roots:
        if not base.exists():
            continue
        for pat in ("*.md", "*.rst", "*.txt"):
            for p in base.rglob(pat):
                if p.stat().st_size < 400_000:
                    yield p
                    n += 1
                    if n > MAX_FILES:
                        return


def py_text():
    std = pathlib.Path(sysconfig.get_paths()["stdlib"])
    site = pathlib.Path(sysconfig.get_paths()["purelib"])
    count = 0
    for base in (std, site):
        for p in base.rglob("*.py"):
            if "test" in p.parts or p.stat().st_size > 300_000:
                continue
            try:
                tree = ast.parse(p.read_text(encoding="utf-8", errors="ignore"))
            except Exception:
                continue
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.ClassDef, ast.Module, ast.AsyncFunctionDef)):
                    d = ast.get_docstring(node)
                    if d:
                        yield d
            count += 1
            if count > MAX_FILES:
                return


def main() -> None:
    freq: collections.Counter[str] = collections.Counter()
    for p in prose_files():
        try:
            for w in WORD.findall(p.read_text(encoding="utf-8", errors="ignore")):
                freq[w.lower()] += 1
        except OSError:
            pass
    for doc in py_text():
        for w in WORD.findall(doc):
            freq[w.lower()] += 1
    try:  # general English vocabulary shipped with the spaCy model (MIT-licensed)
        import spacy

        for tok in spacy.load("en_core_web_sm").vocab.strings:
            if re.fullmatch(r"[A-Za-z]{3,24}", tok):
                freq[tok.lower()] += 8
    except Exception as exc:  # the lexicon still builds from local text alone
        print("spaCy vocab unavailable:", exc)
    extra = [w for line in (ROOT / "scanner" / "data" / "extra_words.txt").read_text(encoding="utf-8").splitlines() if not line.startswith("#") for w in line.split()]
    for w in extra:
        freq[w.lower()] += 50

    # Drop corpus junk: embedded random blobs show up as rare, odd words.
    words = [
        w
        for w, c in freq.most_common()
        if c >= 6 and 3 <= len(w) <= 24 and not re.search(r"[^aeiouy]{5,}", w) and not re.search(r"(.)", w) and re.search(r"[aeiouy]", w)
    ]
    words = words[:70000]
    wordset = set(words)

    uni: collections.Counter[str] = collections.Counter()
    bi: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    tri: dict[str, collections.Counter[str]] = collections.defaultdict(collections.Counter)
    for w in words:
        weight = 1 + min(3, int(freq[w] ** 0.25))
        s = "^^" + w + "$"
        for i in range(2, len(s)):
            c = s[i]
            uni[c] += weight
            bi[s[i - 1]][c] += weight
            tri[s[i - 2 : i]][c] += weight

    # Keep the file small: drop trigram contexts seen fewer than 4 times.
    tri_out = {k: dict(v) for k, v in tri.items() if sum(v.values()) >= 4}
    OUT.write_text(
        json.dumps({"words": words, "uni": dict(uni), "bi": {k: dict(v) for k, v in bi.items()}, "tri": tri_out}, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"words={len(words)} files={OUT.stat().st_size // 1024} KB wordset_has_xyz={'xyz' in wordset} has_kubernetes={'kubernetes' in wordset}")


if __name__ == "__main__":
    sys.path.insert(0, str(ROOT))
    main()
