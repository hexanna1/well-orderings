"""Order finite tables of canonical ordinal terms."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from functools import cmp_to_key
from heapq import heappop, heappush
from itertools import chain
from typing import Any, Protocol, TypeVar


class TableOrdinal(Protocol):
    @property
    def terms(self) -> tuple[tuple[Any, int], ...]: ...

    def to_latex(self) -> str: ...


OrdinalOrder = Callable[[list[TableOrdinal]], list[int]]
TermFields = Callable[[Any, int], tuple[int | TableOrdinal, ...]]
PrincipalEntries = Callable[[Any], Iterable[tuple[int | TableOrdinal, TableOrdinal]]]
Fields = TypeVar("Fields")
Value = TypeVar("Value")


def _fold_subterms(
    ordinals: list[TableOrdinal],
    fields_of: Callable[[TableOrdinal], Fields],
    children_in: Callable[[Fields], Iterable[TableOrdinal]],
    combine: Callable[[Fields, dict[int, Value]], Value],
) -> list[Value]:
    """Build a value for each object after its children. The rows own the whole DAG."""
    values: dict[int, Value] = {}
    for root in ordinals:
        stack: list[tuple[TableOrdinal, Fields | None]] = [(root, None)]
        while stack:
            ordinal, fields = stack.pop()
            if id(ordinal) in values:
                continue
            if fields is None:
                fields = fields_of(ordinal)
                pending = [
                    (child, None) for child in children_in(fields) if id(child) not in values
                ]
                if pending:
                    stack.append((ordinal, fields))
                    stack.extend(pending)
                    continue
            values[id(ordinal)] = combine(fields, values)
    return [values[id(ordinal)] for ordinal in ordinals]


def _compare_keys(left: tuple, right: tuple) -> int:
    """Compare interned keys whose nesting exceeds native tuple comparison."""
    while True:
        for a, b in zip(left, right):
            if a is b:
                continue
            if isinstance(a, int):
                if a != b:
                    return -1 if a < b else 1
            else:
                # Equal subterms share one tuple. The first distinct child
                # determines the order without returning to its parent.
                left, right = a, b
                break
        else:
            return (len(left) > len(right)) - (len(left) < len(right))


def _lexicographic_order(ordinals: list[TableOrdinal], term_fields: TermFields) -> list[int]:
    def fields_of(ordinal):
        return tuple(
            field for principal, count in ordinal.terms for field in term_fields(principal, count)
        )

    def children_in(fields):
        return (field for field in fields if not isinstance(field, int))

    by_fields: dict[tuple[int, ...], tuple] = {}

    def intern(fields, by_identity):
        parts = []
        signature = []
        for field in fields:
            if isinstance(field, int):
                parts.append(field)
                signature.append(field)
            else:
                child = by_identity[id(field)]
                parts.append(child)
                signature.append(id(child))
        # Within each notation, the same field of every term is a child
        # or an integer. Flat signatures avoid hashing entire subtrees.
        return by_fields.setdefault(tuple(signature), tuple(parts))

    keys = _fold_subterms(ordinals, fields_of, children_in, intern)
    indexes = range(len(keys))
    try:
        return sorted(indexes, key=keys.__getitem__)
    except RecursionError:
        compare = cmp_to_key(_compare_keys)
        return sorted(indexes, key=lambda index: compare(keys[index]))


def cantor_order(ordinals: list[TableOrdinal]) -> list[int]:
    return _lexicographic_order(ordinals, lambda exponent, count: (exponent, count))


def collapsing_order(ordinals: list[TableOrdinal]) -> list[int]:
    return _lexicographic_order(
        ordinals, lambda principal, count: (principal.level, principal.arg, count)
    )


def _veblen_order(ordinals: list[TableOrdinal], principal_entries: PrincipalEntries) -> list[int]:
    """Rank subterms in increasing ordinal order, then order rows by their ranks.

    A preferred principal exceeds every position and argument in its sparse
    array. A sum exceeds each of its principal summands. Thus the least
    unranked ordinal is ready as soon as all smaller ordinals have ranks.
    Among ready principals, every argument is below both principals, so Veblen
    comparison reduces to lexicographic comparison at the highest differing
    position. A ready sum is below every ready principal by additive closure.
    """
    # For a principal the pairs are (position, argument) node IDs in descending
    # position order. For a sum they are (principal node ID, coefficient).
    signatures: list[tuple[bool, tuple[tuple[int, int], ...]]] = []
    node_ids: dict[tuple[bool, tuple[tuple[int, int], ...]], int] = {}
    successors: list[list[int]] = []
    remaining: list[int] = []

    def intern(principal: bool, fields: tuple[tuple[int, int], ...]) -> int:
        signature = (principal, fields)
        node = node_ids.get(signature)
        if node is not None:
            return node
        node = len(signatures)
        signatures.append(signature)
        node_ids[signature] = node
        children = chain.from_iterable(fields) if principal else (term for term, _ in fields)
        successors.append([])
        count = 0
        for child in children:
            successors[child].append(node)
            count += 1
        remaining.append(count)
        return node

    zero = intern(False, ())
    one = intern(True, ())

    def position_node(position: int | TableOrdinal, ordinal_ids: dict[int, int]) -> int:
        if isinstance(position, int):
            if position == 0:
                return zero
            if position == 1:
                return one
            return intern(False, ((one, position),))
        return ordinal_ids[id(position)]

    def fields_of(ordinal):
        fields = []
        for principal, count in ordinal.terms:
            entries = [entry for entry in principal_entries(principal) if entry[1].terms]
            fields.append((entries, count))
        return fields

    def children_in(fields):
        for entries, _ in fields:
            for position, argument in entries:
                yield argument
                if not isinstance(position, int):
                    yield position

    def sum_node(fields, ordinal_ids):
        terms = []
        for entries, coefficient in fields:
            pairs = tuple((position_node(pos, ordinal_ids), ordinal_ids[id(arg)]) for pos, arg in entries)
            terms.append((intern(True, pairs), coefficient))
        if len(terms) == 1 and terms[0][1] == 1:
            return terms[0][0]
        return intern(False, tuple(terms))

    roots = _fold_subterms(ordinals, fields_of, children_in, sum_node)
    ranks = [0] * len(signatures)
    ready = []

    def enqueue(node: int) -> None:
        principal, fields = signatures[node]
        if principal:
            key = tuple((ranks[position], ranks[argument]) for position, argument in fields)
        else:
            key = tuple((ranks[term], coefficient) for term, coefficient in fields)
        heappush(ready, (principal, key, node))

    for node, count in enumerate(remaining):
        if count == 0:
            enqueue(node)
    for rank in range(len(signatures)):
        _, _, node = heappop(ready)
        ranks[node] = rank
        for parent in successors[node]:
            remaining[parent] -= 1
            if remaining[parent] == 0:
                enqueue(parent)
    return sorted(range(len(ordinals)), key=lambda i: ranks[roots[i]])


def binary_order(ordinals: list[TableOrdinal]) -> list[int]:
    return _veblen_order(ordinals, lambda phi: ((1, phi.beta), (0, phi.gamma)))


def finitary_order(ordinals: list[TableOrdinal]) -> list[int]:
    def entries(principal):
        for position in reversed(range(len(principal.args))):
            yield position, principal.args[position]

    return _veblen_order(ordinals, entries)


def transfinitary_order(ordinals: list[TableOrdinal]) -> list[int]:
    return _veblen_order(ordinals, lambda matrix: matrix.entries)
