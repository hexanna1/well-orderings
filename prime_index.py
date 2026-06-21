"""Prime indexing and factorization helpers."""

from __future__ import annotations

from math import isqrt


def _require_int_at_least(value: int, minimum: int, name: str) -> None:
    if type(value) is not int or value < minimum:
        raise ValueError(f"{name} must be an integer >= {minimum}")


class PrimeIndexHelper:
    def __init__(self) -> None:
        self.primes = [2]
        self.prime_to_index = {2: 1}
        self.next_candidate = 3

    def _is_prime(self, candidate: int) -> bool:
        limit = isqrt(candidate)
        for prime in self.primes:
            if prime > limit:
                return True
            if candidate % prime == 0:
                return False
        return True

    def _extend_once(self) -> None:
        candidate = self.next_candidate
        while True:
            if self._is_prime(candidate):
                self.primes.append(candidate)
                self.prime_to_index[candidate] = len(self.primes)
                self.next_candidate = candidate + 2
                return
            candidate += 2

    def prime_at_index(self, index: int) -> int:
        _require_int_at_least(index, 1, "index")
        while len(self.primes) < index:
            self._extend_once()
        return self.primes[index - 1]

    def prime_index(self, prime: int) -> int:
        _require_int_at_least(prime, 2, "prime")

        index = self.prime_to_index.get(prime)
        if index is not None:
            return index

        limit = isqrt(prime)
        while self.primes[-1] < limit:
            self._extend_once()

        for known_prime in self.primes:
            if known_prime > limit:
                break
            if prime % known_prime == 0:
                raise ValueError(f"{prime} is not prime")

        while self.primes[-1] < prime:
            self._extend_once()

        index = self.prime_to_index.get(prime)
        if index is None:
            raise ValueError(f"{prime} is not prime")
        return index

    def primes_up_to(self, n: int) -> list[int]:
        if n < 2:
            return []

        while self.primes[-1] < n:
            self._extend_once()
        return [prime for prime in self.primes if prime <= n]

    def factorize(self, n: int) -> list[tuple[int, int]]:
        _require_int_at_least(n, 1, "n")
        if n == 1:
            return []

        factors: list[tuple[int, int]] = []
        remainder = n
        index = 1
        while True:
            prime = self.prime_at_index(index)
            if prime * prime > remainder:
                break
            if remainder % prime == 0:
                exp = 0
                while remainder % prime == 0:
                    remainder //= prime
                    exp += 1
                factors.append((prime, exp))
            index += 1

        if remainder > 1:
            factors.append((remainder, 1))
        return factors
