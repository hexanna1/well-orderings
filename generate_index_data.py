"""Generate browser-side prime and admissibility indexes."""

from __future__ import annotations

import argparse
import struct
import subprocess
from math import isqrt
from pathlib import Path
from tempfile import TemporaryDirectory

DEFAULT_MAXIMUM = 1_000_000_000
PRIME_BLOCK_SIZE = 32_768
HEADER = struct.Struct("<4sIII")
ROOT = Path(__file__).resolve().parent
INDEX_DATA = ROOT / "docs" / "data" / "indexes"
ADMISSIBILITY_GENERATOR = ROOT / "generate_admissibility_data.js"
COLLAPSING_ENCODERS = ("buchholz_1", "buchholz", "ebocf")


def small_primes(limit: int) -> list[int]:
    is_prime = bytearray(b"\x01") * (limit + 1)
    is_prime[:2] = b"\x00\x00"
    for prime in range(2, isqrt(limit) + 1):
        if not is_prime[prime]:
            continue
        start = prime * prime
        count = (limit - start) // prime + 1
        is_prime[start::prime] = b"\x00" * count
    return [prime for prime, value in enumerate(is_prime) if value]


def generate_prime_index(maximum: int, output_directory: Path) -> None:
    base_primes = small_primes(isqrt(maximum))
    block_count = (maximum + PRIME_BLOCK_SIZE) // PRIME_BLOCK_SIZE
    block_prime_counts = []
    for block in range(block_count):
        start = block * PRIME_BLOCK_SIZE
        end = min(maximum + 1, start + PRIME_BLOCK_SIZE)
        is_prime = bytearray(b"\x01") * (end - start)
        for prime in base_primes:
            if prime * prime >= end:
                break
            first = max(prime * prime, ((start + prime - 1) // prime) * prime)
            count = (end - 1 - first) // prime + 1
            is_prime[first - start :: prime] = b"\x00" * count
        for value in range(start, min(end, 2)):
            is_prime[value - start] = 0
        block_prime_counts.append(is_prime.count(1))
    payload = bytearray(
        HEADER.pack(b"PRI1", maximum, PRIME_BLOCK_SIZE, len(block_prime_counts) + 1),
    )
    payload.extend(struct.pack(f"<{len(block_prime_counts)}H", *block_prime_counts))
    (output_directory / "prime_index.bin").write_bytes(payload)


def validate_prime_index(maximum: int) -> None:
    prime_data = (INDEX_DATA / "prime_index.bin").read_bytes()
    magic, stored_maximum, _block_size, count = HEADER.unpack_from(prime_data)
    if (
        magic != b"PRI1"
        or stored_maximum != maximum
        or count < 2
        or len(prime_data) != HEADER.size + 2 * (count - 1)
    ):
        raise ValueError("prime_index.bin does not match this generator")


def generate_admissibility(
    names: tuple[str, ...],
    prime_index: Path,
    output_directory: Path,
    workers: int | None,
) -> None:
    command = [
        "node",
        str(ADMISSIBILITY_GENERATOR),
        str(prime_index),
        str(output_directory),
        str(workers or 0),
    ]
    command.extend(names)
    try:
        subprocess.run(command, check=True)
    except FileNotFoundError as error:
        raise RuntimeError("Node.js is required to generate admissibility data") from error


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "target",
        choices=("all", *COLLAPSING_ENCODERS),
        default="all",
        nargs="?",
    )
    parser.add_argument("--maximum", type=int, default=DEFAULT_MAXIMUM)
    parser.add_argument("--workers", type=int)
    args = parser.parse_args()
    if not 2 <= args.maximum <= DEFAULT_MAXIMUM:
        parser.error(f"--maximum must be from 2 through {DEFAULT_MAXIMUM}")
    if args.workers is not None and args.workers < 1:
        parser.error("--workers must be positive")

    with TemporaryDirectory(prefix="_index_data.", dir=INDEX_DATA) as temporary:
        output_directory = Path(temporary)
        generated_filenames = []

        if args.target == "all":
            generate_prime_index(args.maximum, output_directory)
            generated_filenames.append("prime_index.bin")
            prime_index = output_directory / "prime_index.bin"
        else:
            validate_prime_index(args.maximum)
            prime_index = INDEX_DATA / "prime_index.bin"

        targets = COLLAPSING_ENCODERS if args.target == "all" else (args.target,)
        generate_admissibility(targets, prime_index, output_directory, args.workers)
        generated_filenames.extend(f"{name}_admissible.bin" for name in targets)

        for filename in generated_filenames:
            (output_directory / filename).replace(INDEX_DATA / filename)


if __name__ == "__main__":
    main()
