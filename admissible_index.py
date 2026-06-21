"""Guarded arguments and rank indexes for collapsing ordinals."""

from __future__ import annotations

import gzip
import struct
from array import array
from bisect import bisect_left
from collections.abc import Callable, Iterator
from functools import cache
from threading import Lock
from typing import Generic, TypeVar

from prime_index import INDEX_DIRECTORY, _require_int_at_least


Ordinal = TypeVar("Ordinal")


def guarded_arguments(level, ordinal: Ordinal, *, compare_ordinal_levels=None, legal: bool) -> Iterator[Ordinal]:
    """Visit the hereditary support. For a legal term, only its upper bounds are needed."""
    pending = [ordinal]
    seen: set[int] = set()
    while pending:
        node = pending.pop()
        if id(node) in seen:
            continue
        seen.add(id(node))
        for principal, _ in node.terms:
            if compare_ordinal_levels is None:
                order = principal.level - level
            else:
                order = compare_ordinal_levels(principal.level, level)
            if order < 0:
                continue
            yield principal.arg
            if compare_ordinal_levels is not None:
                pending.append(principal.level)
            # At equal levels, legality puts the nested guards below principal.arg.
            if not legal or order > 0:
                pending.append(principal.arg)


def _unpack_gaps(data: memoryview, count: int, bits: int) -> Iterator[int]:
    mask = (1 << bits) - 1
    word = available = 0
    source = iter(data)
    for _ in range(count):
        while available < bits:
            word |= next(source) << available
            available += 8
        yield word & mask
        word >>= bits
        available -= bits


@cache
def _checkpoints(name: str) -> tuple[array, array]:
    path = INDEX_DIRECTORY / f"{name}_admissible.bin.gz"
    data = memoryview(gzip.decompress(path.read_bytes()))
    _, _, segment_count, _ = struct.unpack_from("<4sIII", data)
    ranks = array("I")
    codes = array("I")
    offset = 16
    for _ in range(segment_count):
        first_rank, stride, count, bits, baseline, code = struct.unpack_from("<IIIB3xII", data, offset)
        offset += 24
        size = ((count - 1) * bits + 7) // 8
        gaps = _unpack_gaps(data[offset:offset + size], count - 1, bits)
        ranks.extend(range(first_rank, first_rank + count * stride, stride))
        codes.append(code)
        for gap in gaps:
            code += stride + baseline + gap
            codes.append(code)
        offset += size
    return ranks, codes


class AdmissibleIndex(Generic[Ordinal]):
    def __init__(
        self,
        decode: Callable[[int], Ordinal],
        encode: Callable[[Ordinal], int],
        admissible: Callable[[Ordinal], bool],
        checkpoint_name: str | None = None,
    ) -> None:
        self.decode = decode
        self.encode = encode
        self.admissible = admissible
        self.checkpoint_name = checkpoint_name
        # Position zero is the boundary before the first admissible raw code.
        self.prefix = [0]
        self._prefix_lock = Lock()
        self.cursor = (0, 0)

    def _append(self) -> None:
        code = self.prefix[-1] + 1
        while not self.admissible(self.decode(code)):
            code += 1
        self.prefix.append(code)

    def prepare(self, count: int) -> None:
        if count >= len(self.prefix):
            with self._prefix_lock:
                while len(self.prefix) <= count:
                    self._append()

    def table_codes(self, count: int) -> list[int]:
        self.prepare(count)
        return self.prefix[1:count + 1]

    def _anchor(self, name: str, target: int, *, by_rank: bool) -> tuple[int, int]:
        ranks, codes = _checkpoints(name)
        values = ranks if by_rank else codes
        upper = bisect_left(values, target)
        index = upper - 1
        if upper < len(values) and values[upper] - target < target - values[index]:
            index = upper
        field = 0 if by_rank else 1
        prefix_rank = len(self.prefix) - 1
        return min(
            (ranks[index], codes[index]),
            self.cursor,
            (prefix_rank, self.prefix[prefix_rank]),
            key=lambda point: abs(point[field] - target),
        )

    def unrank(self, rank: int) -> Ordinal:
        _require_int_at_least(rank, 1, "rank")
        if self.checkpoint_name is None or rank < len(self.prefix) + 64:
            self.prepare(rank)
            return self.decode(self.prefix[rank])
        current, code = self._anchor(self.checkpoint_name, rank, by_rank=True)
        step = 1 if rank > current else -1
        while current != rank:
            code += step
            if self.admissible(self.decode(code)):
                current += step
        self.cursor = (rank, code)
        return self.decode(code)

    def rank(self, ordinal: Ordinal) -> int:
        if not self.admissible(ordinal):
            raise ValueError("argument is not admissible at this level")
        code = self.encode(ordinal)
        if self.checkpoint_name is None or code <= self.prefix[-1] + 64:
            with self._prefix_lock:
                while self.prefix[-1] < code:
                    self._append()
                return bisect_left(self.prefix, code)
        rank, current = self._anchor(self.checkpoint_name, code, by_rank=False)
        step = 1 if code > current else -1
        while current != code:
            current += step
            if self.admissible(self.decode(current)):
                rank += step
        self.cursor = (rank, code)
        return rank
