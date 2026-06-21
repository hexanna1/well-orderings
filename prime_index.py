"""Prime indexing and factorization helpers."""

from __future__ import annotations

import gzip
import struct
from bisect import bisect_left, bisect_right
from functools import cache, lru_cache
from itertools import accumulate, chain, islice
from math import isqrt
from pathlib import Path
from threading import Lock


INDEX_DIRECTORY = Path(__file__).resolve().parent / "docs" / "data" / "indexes"


def _require_int_at_least(value: int, minimum: int, name: str) -> None:
    if type(value) is not int or value < minimum:
        raise ValueError(f"{name} must be an integer >= {minimum}")


def _sieve_primes(limit: int) -> list[int]:
    odd_count = (limit + 1) // 2
    flags = bytearray(b"\x01") * odd_count
    for prime in range(3, isqrt(limit) + 1, 2):
        if flags[prime // 2]:
            start = prime * prime // 2
            count = (odd_count - 1 - start) // prime + 1
            flags[start::prime] = bytes(count)
    return [2] + [2 * i + 1 for i in range(1, odd_count) if flags[i]]


@lru_cache(maxsize=4)
def _sieving_primes(limit: int) -> list[int]:
    return _sieve_primes(limit)


class _PrimeBlocks:
    def __init__(self) -> None:
        data = gzip.decompress((INDEX_DIRECTORY / "prime_index.bin.gz").read_bytes())
        _, maximum, self.block_size, count = struct.unpack_from("<4sIII", data)
        block_counts = struct.unpack_from(f"<{count - 1}H", data, 16)
        # Keep complete blocks. The final partial block can be sieved through its
        # natural endpoint, including for queries just past the shipped maximum.
        complete = (maximum + 1) // self.block_size
        self.prefix = list(accumulate(block_counts[:complete], initial=0))
        self._tail_lock = Lock()

    @lru_cache(maxsize=64)
    def block(self, number: int) -> list[int]:
        start = number * self.block_size
        stop = start + self.block_size
        first_odd = start | 1
        size = (stop - first_odd + 1) // 2
        flags = bytearray(b"\x01") * size
        limit = isqrt(stop - 1)
        for prime in _sieving_primes(1 << limit.bit_length()):
            if prime == 2:
                continue
            if prime > limit:
                break
            first = max(prime * prime, ((first_odd + prime - 1) // prime) * prime)
            if first % 2 == 0:
                first += prime
            offset = (first - first_odd) // 2
            flags[offset::prime] = bytes((size - 1 - offset) // prime + 1)
        if start == 0:
            flags[0] = 0
        primes = [first_odd + 2 * i for i, flag in enumerate(flags) if flag]
        if start == 0:
            primes.insert(0, 2)
        return primes

    def _extend_prefix(self, *, block: int = 0, rank: int = 0) -> None:
        # The shipped checkpoints normally cover the query. Beyond them keep a
        # count per sieved block so successive queries can continue where we stopped.
        if block < len(self.prefix) and rank <= self.prefix[-1]:
            return
        with self._tail_lock:
            while block >= len(self.prefix) or rank > self.prefix[-1]:
                next_block = self.block(len(self.prefix) - 1)
                self.prefix.append(self.prefix[-1] + len(next_block))

    def rank(self, prime: int) -> int:
        number = prime // self.block_size
        if number >= len(self.prefix):
            # An arbitrarily large composite can have a tiny divisor. Reject it
            # before allocating sieve flags through the square root of its block.
            for divisor in chain((2,), range(3, isqrt(prime) + 1, 2)):
                if prime % divisor == 0:
                    raise ValueError(f"{prime} is not prime")
        primes = self.block(number)
        offset = bisect_left(primes, prime)
        if offset == len(primes) or primes[offset] != prime:
            raise ValueError(f"{prime} is not prime")
        self._extend_prefix(block=number)
        return self.prefix[number] + offset + 1

    def select(self, rank: int) -> int:
        self._extend_prefix(rank=rank)
        number = bisect_left(self.prefix, rank) - 1
        return self.block(number)[rank - self.prefix[number] - 1]


@cache
def _prime_blocks() -> _PrimeBlocks:
    return _PrimeBlocks()


class _DenseSieve:
    def __init__(self, limit: int) -> None:
        self.limit = limit
        self.primes = _sieve_primes(limit)
        self.ranks = {prime: rank for rank, prime in enumerate(self.primes, 1)}


class PrimeIndexHelper:
    def __init__(self) -> None:
        self._sieve = _DenseSieve(2)
        self._sieve_lock = Lock()

    def _extend_through(self, limit: int) -> _DenseSieve:
        sieve = self._sieve
        if limit <= sieve.limit:
            return sieve
        with self._sieve_lock:
            if limit > self._sieve.limit:
                self._sieve = _DenseSieve(max(limit, 2 * self._sieve.limit))
            return self._sieve

    def prime_at_index(self, index: int) -> int:
        _require_int_at_least(index, 1, "index")
        # Small isolated queries avoid loading the block directory. Prepared
        # table lookups use the dense prefix already held by this helper.
        sieve = self._sieve
        if index > max(512, len(sieve.primes)):
            return _prime_blocks().select(index)
        while len(sieve.primes) < index:
            sieve = self._extend_through(max(16, 2 * sieve.limit))
        return sieve.primes[index - 1]

    def prime_index(self, prime: int) -> int:
        _require_int_at_least(prime, 2, "prime")
        if prime > max(4096, self._sieve.limit):
            return _prime_blocks().rank(prime)
        index = self._extend_through(prime).ranks.get(prime)
        if index is None:
            raise ValueError(f"{prime} is not prime")
        return index

    def primes_up_to(self, n: int) -> list[int]:
        _require_int_at_least(n, 0, "n")
        if n < 2:
            return []

        primes = self._extend_through(n).primes
        return primes[:bisect_right(primes, n)]

    def factorize(self, n: int) -> list[tuple[int, int]]:
        _require_int_at_least(n, 1, "n")
        if n == 1:
            return []

        factors: list[tuple[int, int]] = []
        remainder = n
        sieve = self._sieve
        primes = sieve.primes
        while remainder > 1:
            for prime in primes:
                if prime * prime > remainder:
                    break
                if remainder % prime == 0:
                    exp = 0
                    while remainder % prime == 0:
                        remainder //= prime
                        exp += 1
                    factors.append((prime, exp))
            else:
                limit = isqrt(remainder)
                if limit > sieve.limit:
                    cursor = len(sieve.primes)
                    sieve = self._extend_through(min(limit, max(16, 2 * sieve.limit)))
                    primes = islice(sieve.primes, cursor, None)
                    continue
            break

        if remainder > 1:
            factors.append((remainder, 1))
        return factors
