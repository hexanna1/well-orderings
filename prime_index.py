"""Prime indexing and factorization helpers."""

from __future__ import annotations

from bisect import bisect_right
from math import isqrt


def _require_int_at_least(value: int, minimum: int, name: str) -> None:
    if type(value) is not int or value < minimum:
        raise ValueError(f"{name} must be an integer >= {minimum}")


class PrimeIndexHelper:
    def __init__(self) -> None:
        self.primes = [2]
        self.prime_to_index = {2: 1}
        self._sieve_limit = 2

    def _extend_through(self, limit: int) -> None:
        if limit <= self._sieve_limit:
            return
        limit = max(limit, 2 * self._sieve_limit)

        odd_count = (limit + 1) // 2
        odd_is_prime = bytearray(b"\x01") * odd_count
        odd_is_prime[0] = 0
        for prime in range(3, isqrt(limit) + 1, 2):
            if not odd_is_prime[prime // 2]:
                continue
            start = prime * prime // 2
            count = (odd_count - 1 - start) // prime + 1
            odd_is_prime[start::prime] = b"\x00" * count

        self.primes = [2]
        self.primes.extend(
            2 * index + 1
            for index in range(1, odd_count)
            if odd_is_prime[index]
        )
        self.prime_to_index = {
            prime: index
            for index, prime in enumerate(self.primes, 1)
        }
        self._sieve_limit = limit

    def prime_at_index(self, index: int) -> int:
        _require_int_at_least(index, 1, "index")
        while len(self.primes) < index:
            self._extend_through(max(16, 2 * self._sieve_limit))
        return self.primes[index - 1]

    def prime_index(self, prime: int) -> int:
        _require_int_at_least(prime, 2, "prime")

        index = self.prime_to_index.get(prime)
        if index is not None:
            return index

        self._extend_through(isqrt(prime))
        for known_prime in self.primes:
            if known_prime * known_prime > prime:
                break
            if prime % known_prime == 0:
                raise ValueError(f"{prime} is not prime")

        self._extend_through(prime)
        return self.prime_to_index[prime]

    def primes_up_to(self, n: int) -> list[int]:
        _require_int_at_least(n, 0, "n")
        if n < 2:
            return []

        self._extend_through(n)
        return self.primes[:bisect_right(self.primes, n)]

    def factorize(self, n: int) -> list[tuple[int, int]]:
        _require_int_at_least(n, 1, "n")
        if n == 1:
            return []

        self._extend_through(isqrt(n))
        factors: list[tuple[int, int]] = []
        remainder = n
        for prime in self.primes:
            if prime * prime > remainder:
                break
            if remainder % prime == 0:
                exp = 0
                while remainder % prime == 0:
                    remainder //= prime
                    exp += 1
                factors.append((prime, exp))

        if remainder > 1:
            factors.append((remainder, 1))
        return factors
