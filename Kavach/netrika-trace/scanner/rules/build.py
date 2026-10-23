"""Regenerate the shared JSON rule pack: `python -m scanner.rules.build`."""

import json
import pathlib

from scanner.rules import formats_src

OUT = pathlib.Path(__file__).parent / "formats.json"


def main() -> None:
    ids = [r["id"] for r in formats_src.R]
    assert len(ids) == len(set(ids)), "duplicate rule ids"
    OUT.write_text(json.dumps({"version": 1, "rules": formats_src.R}, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT} ({len(ids)} rules)")


if __name__ == "__main__":
    main()
