#!/usr/bin/env python3
"""Generate docs/*.tex files for ordinal website tables."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from encoder_registry import ENCODER_SPECS
from latex_document import build_prime_table_document


ROW_RE = re.compile(r"^\s*(\d+)\s*&\\mapsto\s*(.*?)&\\\\\s*$")


ENCODER_NAMES = tuple(ENCODER_SPECS)


def validate_tex_table(document: str) -> None:
    for line in document.splitlines():
        if ROW_RE.match(line) is not None:
            return
    raise ValueError("no mapping rows found in generated document")


def generate_document(name: str, limit: int) -> str:
    spec = ENCODER_SPECS[name]
    encoder = spec.factory()
    prepare_prime_table = getattr(encoder, "prepare_prime_table", None)
    if prepare_prime_table is not None:
        prepare_prime_table(limit)
    document = build_prime_table_document(
        limit,
        encoder,
        order="ordinal",
        compare_ordinals=spec.compare_ordinals,
    )
    validate_tex_table(document)
    return document


def generate_tex(name: str, limit: int, site_dir: Path) -> None:
    spec = ENCODER_SPECS[name]
    document = generate_document(name, limit)
    site_dir.mkdir(parents=True, exist_ok=True)

    tex_output = site_dir / spec.tex_filename
    tex_output.write_text(document, encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=20_000, help="Generate prime rows up to this integer.")
    args = parser.parse_args()

    if args.limit < 2:
        raise SystemExit("--limit must be >= 2")

    names = list(ENCODER_NAMES)
    site_dir = Path(__file__).resolve().parent / "docs"

    for name in names:
        generate_tex(name, args.limit, site_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
