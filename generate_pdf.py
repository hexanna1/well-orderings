#!/usr/bin/env python3

import argparse
import subprocess
from pathlib import Path

from encoder_registry import ENCODER_SPECS
from latex_document import build_prime_table_document


def table_limit(value: str) -> int:
    limit = int(value)
    if limit < 2:
        raise argparse.ArgumentTypeError("must be >= 2")
    return limit


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate ordinal prime-index LaTeX tables.")
    mode_group = parser.add_mutually_exclusive_group(required=True)
    for spec in ENCODER_SPECS.values():
        mode_group.add_argument(f"--{spec.name}", type=table_limit, metavar="N", help=spec.pdf_help)
    parser.add_argument(
        "--ordinal-order",
        action="store_true",
        help="Sort prime rows by decoded ordinal instead of by prime value.",
    )
    args = parser.parse_args()

    name, n = next(
        (name, getattr(args, name))
        for name in ENCODER_SPECS
        if getattr(args, name) is not None
    )
    spec = ENCODER_SPECS[name]
    encoder = spec.factory()
    order = "ordinal" if args.ordinal_order else "number"
    document = build_prime_table_document(
        n,
        encoder,
        order=order,
        compare_ordinals=spec.compare_ordinals,
    )
    tex_filename = spec.tex_filename

    output_dir = Path(__file__).resolve().parent / "outputs"
    output_dir.mkdir(exist_ok=True)
    tex_path = output_dir / tex_filename

    with open(tex_path, "w", encoding="utf-8") as f:
        f.write(document)

    subprocess.run(["lualatex", tex_path.name], cwd=output_dir, check=True)
    subprocess.run(["latexmk", "-c", tex_path.name], cwd=output_dir, check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
