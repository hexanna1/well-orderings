"""Generate browser-side prime and admissibility indexes."""

from __future__ import annotations

import argparse
import gzip
import shutil
import sqlite3
import struct
import subprocess
import zlib
from contextlib import closing
from math import isqrt
from pathlib import Path
from tempfile import TemporaryDirectory

DEFAULT_MAXIMUM = 1_000_000_000
PRIME_BLOCK_SIZE = 32_768
HEADER = struct.Struct("<4sIII")
ROOT = Path(__file__).resolve().parent
INDEX_DATA = ROOT / "docs" / "data" / "indexes"
PRIME_FILENAME = "prime_index.bin.gz"
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
    odd_primes = small_primes(isqrt(maximum))[1:]
    window_size = 64 * PRIME_BLOCK_SIZE  # 1 MiB of odd-only sieve flags
    block_prime_counts = []
    for start in range(0, maximum + 1, window_size):
        end = min(maximum + 1, start + window_size)
        # Index i denotes the odd integer start + 2*i + 1.
        flags = bytearray(b"\x01") * ((end - start) // 2)
        if start == 0:
            flags[0] = 0
        for prime in odd_primes:
            if prime * prime >= end:
                break
            first = max(prime * prime, ((start + prime - 1) // prime) * prime)
            if first % 2 == 0:
                first += prime
            offset = (first - start) // 2
            count = (len(flags) + prime - 1 - offset) // prime
            flags[offset::prime] = b"\x00" * count
        for block in range(start, end, PRIME_BLOCK_SIZE):
            lo = (block - start) // 2
            block_prime_counts.append(flags.count(1, lo, lo + PRIME_BLOCK_SIZE // 2))
    block_prime_counts[0] += 1  # The prime 2.
    payload = bytearray(
        HEADER.pack(b"PRI1", maximum, PRIME_BLOCK_SIZE, len(block_prime_counts) + 1),
    )
    payload.extend(struct.pack(f"<{len(block_prime_counts)}H", *block_prime_counts))
    (output_directory / PRIME_FILENAME).write_bytes(
        gzip.compress(payload, compresslevel=9, mtime=0),
    )


def prime_maximum(path: Path) -> int:
    data = gzip.decompress(path.read_bytes())
    magic, maximum, _block_size, count = HEADER.unpack_from(data)
    if magic != b"PRI1" or count < 2 or len(data) != HEADER.size + 2 * (count - 1):
        raise ValueError("prime_index.bin.gz does not match this generator")
    return maximum


def publish_indexes(output: Path, names: tuple[str, ...], maximum: int, *, publish_prime: bool) -> None:
    # The exclusive transaction holds a cross-process file lock for the renames.
    # The OS releases it if the publisher exits mid-install.
    with closing(sqlite3.connect(ROOT / "_index_publish.lock", timeout=60)) as lock:
        lock.execute("BEGIN EXCLUSIVE")
        try:
            installed_maximum = prime_maximum(INDEX_DATA / PRIME_FILENAME)
        except (FileNotFoundError, EOFError, gzip.BadGzipFile, struct.error, zlib.error, ValueError):
            installed_maximum = 0

        filenames = [f"{name}_admissible.bin.gz" for name in names]
        if publish_prime:
            # Advertise a smaller range before trimming its indexes, and a larger
            # range only after all its checkpoints are installed.
            if maximum < installed_maximum:
                filenames.insert(0, PRIME_FILENAME)
            else:
                filenames.append(PRIME_FILENAME)
        elif installed_maximum != maximum:
            raise ValueError("prime index maximum changed during admissibility generation")
        for filename in filenames:
            (output / filename).replace(INDEX_DATA / filename)


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

    INDEX_DATA.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="_index_data.", dir=INDEX_DATA) as temporary:
        output_directory = Path(temporary)
        prime_index = output_directory / PRIME_FILENAME
        if args.target == "all":
            generate_prime_index(args.maximum, output_directory)
        else:
            # Workers reopen this file independently. Give them the same bytes
            # even if another generator publishes a new prime index meanwhile.
            shutil.copyfile(INDEX_DATA / PRIME_FILENAME, prime_index)
            if prime_maximum(prime_index) != args.maximum:
                parser.error("--maximum must match the installed prime index")

        targets = COLLAPSING_ENCODERS if args.target == "all" else (args.target,)
        generate_admissibility(targets, prime_index, output_directory, args.workers)
        publish_indexes(output_directory, targets, args.maximum, publish_prime=args.target == "all")


if __name__ == "__main__":
    main()
