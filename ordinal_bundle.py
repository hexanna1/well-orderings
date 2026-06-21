"""Encode and decode website ordinal skeleton bundles."""

from __future__ import annotations

import struct
from dataclasses import dataclass

BUNDLE_MAGIC = b"ORB1"
BUNDLE_HEADER = struct.Struct("<4sIIBBH")
HEIGHT_RUN = struct.Struct("<HB")


@dataclass(frozen=True)
class OrdinalSkeleton:
    maximum: int
    ordinal_ranks: tuple[int, ...]
    ordinal_heights: tuple[int, ...]
    admissible_raw_codes: tuple[int, ...] | None


def _pack_bitplanes(values: list[int], bits: int) -> bytes:
    output = bytearray((len(values) * bits + 7) // 8)
    bit_offset = 0
    for bit in range(bits - 1, -1, -1):
        for value in values:
            if value & (1 << bit):
                output[bit_offset // 8] |= 1 << (bit_offset % 8)
            bit_offset += 1
    return bytes(output)


def _unpack_bitplanes(data: bytes, count: int, bits: int) -> list[int]:
    values = [0] * count
    bit_offset = 0
    for _bit in range(bits):
        for index in range(count):
            values[index] = (
                (values[index] << 1)
                | ((data[bit_offset // 8] >> (bit_offset % 8)) & 1)
            )
            bit_offset += 1
    return values


def _height_runs(heights: list[int]) -> list[tuple[int, int]]:
    runs: list[tuple[int, int]] = []
    for height in heights:
        if not 0 < height <= 0xFF:
            raise ValueError("row height does not fit in the bundle format")
        if runs and runs[-1][1] == height and runs[-1][0] < 0xFFFF:
            count, _height = runs[-1]
            runs[-1] = (count + 1, height)
        else:
            runs.append((1, height))
    return runs


def encode_bundle(
    ordinal_numbers: list[int],
    ordinal_heights: list[int],
    maximum: int,
    admissible_raw_codes: list[int] | None = None,
) -> bytes:
    if not 2 <= maximum <= 0xFFFFFFFF:
        raise ValueError("maximum does not fit in the bundle format")
    if len(ordinal_numbers) != len(ordinal_heights) or not ordinal_numbers:
        raise ValueError("numbers and heights must be nonempty and have equal length")

    sorted_numbers = sorted(ordinal_numbers)
    if (
        len(set(ordinal_numbers)) != len(ordinal_numbers)
        or sorted_numbers[0] < 2
        or sorted_numbers[-1] > maximum
    ):
        raise ValueError("row numbers must be distinct and within the bundle maximum")
    rank_by_number = {number: rank for rank, number in enumerate(sorted_numbers)}
    ordinal_ranks = [rank_by_number[number] for number in ordinal_numbers]
    rank_bits = max(1, (len(ordinal_numbers) - 1).bit_length())
    runs = _height_runs(ordinal_heights)
    if len(runs) > 0xFFFF:
        raise ValueError("too many row-height runs")

    admissibility_bits = 0
    admissibility_excesses: list[int] = []
    if admissible_raw_codes is not None:
        if len(admissible_raw_codes) != len(ordinal_numbers):
            raise ValueError("admissibility data must have one entry per row")
        previous = 0
        for raw_code in admissible_raw_codes:
            if raw_code <= previous or raw_code > 0xFFFFFFFF:
                raise ValueError("admissibility raw codes must be increasing uint32 values")
            admissibility_excesses.append(raw_code - previous - 1)
            previous = raw_code
        admissibility_bits = max(
            1,
            max(admissibility_excesses, default=0).bit_length(),
        )

    output = bytearray(BUNDLE_HEADER.pack(
        BUNDLE_MAGIC,
        len(ordinal_numbers),
        maximum,
        rank_bits,
        admissibility_bits,
        len(runs),
    ))
    output.extend(_pack_bitplanes(ordinal_ranks, rank_bits))
    for count, height in runs:
        output.extend(HEIGHT_RUN.pack(count, height))
    output.extend(_pack_bitplanes(admissibility_excesses, admissibility_bits))
    return bytes(output)


def decode_bundle(bundle: bytes) -> OrdinalSkeleton:
    if len(bundle) < BUNDLE_HEADER.size:
        raise ValueError("invalid ordinal skeleton bundle")
    magic, row_count, maximum, rank_bits, admissibility_bits, run_count = (
        BUNDLE_HEADER.unpack_from(bundle)
    )
    if (
        magic != BUNDLE_MAGIC
        or row_count < 1
        or maximum < 2
        or not 1 <= rank_bits <= 32
        or admissibility_bits > 32
        or run_count < 1
    ):
        raise ValueError("invalid ordinal skeleton bundle")

    rank_size = (row_count * rank_bits + 7) // 8
    run_offset = BUNDLE_HEADER.size + rank_size
    admissibility_offset = run_offset + run_count * HEIGHT_RUN.size
    admissibility_size = (row_count * admissibility_bits + 7) // 8
    if admissibility_offset + admissibility_size != len(bundle):
        raise ValueError("invalid ordinal skeleton bundle size")

    ordinal_ranks = _unpack_bitplanes(
        bundle[BUNDLE_HEADER.size:run_offset],
        row_count,
        rank_bits,
    )
    if sorted(ordinal_ranks) != list(range(row_count)):
        raise ValueError("invalid ordinal-rank permutation")

    heights: list[int] = []
    for run_index in range(run_count):
        count, height = HEIGHT_RUN.unpack_from(
            bundle,
            run_offset + run_index * HEIGHT_RUN.size,
        )
        if count < 1 or height < 1 or len(heights) + count > row_count:
            raise ValueError("invalid row-height runs")
        heights.extend([height] * count)
    if len(heights) != row_count:
        raise ValueError("invalid row-height runs")

    admissible_raw_codes = None
    if admissibility_bits:
        excesses = _unpack_bitplanes(
            bundle[admissibility_offset:],
            row_count,
            admissibility_bits,
        )
        codes = []
        raw_code = 0
        for excess in excesses:
            raw_code += excess + 1
            if raw_code > 0xFFFFFFFF:
                raise ValueError("invalid admissibility raw codes")
            codes.append(raw_code)
        admissible_raw_codes = tuple(codes)

    return OrdinalSkeleton(
        maximum=maximum,
        ordinal_ranks=tuple(ordinal_ranks),
        ordinal_heights=tuple(heights),
        admissible_raw_codes=admissible_raw_codes,
    )
