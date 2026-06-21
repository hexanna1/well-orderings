"""Encode and decode website ordinal bundles."""

from __future__ import annotations

import struct

BUNDLE_MAGIC = b"ORB1"
LATEX_TOKENS = (
    r"\begin{pmatrix}",
    r"\end{pmatrix}",
    r"\varepsilon",
    r"\varphi",
    r"\omega",
    r"\Omega",
    r"\zeta",
    r"\Gamma",
    r"\psi",
    r"\\",
)


def encode_latex(latex: str) -> bytes:
    encoded = bytearray()
    offset = 0
    while offset < len(latex):
        for token_index, token in enumerate(LATEX_TOKENS):
            if latex.startswith(token, offset):
                encoded.append(0x80 + token_index)
                offset += len(token)
                break
        else:
            codepoint = ord(latex[offset])
            if codepoint >= 0x80:
                raise ValueError("row LaTeX must be ASCII")
            encoded.append(codepoint)
            offset += 1
    return bytes(encoded)


def decode_latex(encoded: bytes) -> str:
    parts = []
    for byte in encoded:
        if byte < 0x80:
            parts.append(chr(byte))
            continue
        token_index = byte - 0x80
        if token_index >= len(LATEX_TOKENS):
            raise ValueError("unknown row bundle token")
        parts.append(LATEX_TOKENS[token_index])
    return "".join(parts)


def encode_bundle(rows: list[tuple[int, str]], heights: list[int]) -> bytes:
    if len(rows) > 0xFFFF:
        raise ValueError("row bundle has too many rows")
    output = bytearray(BUNDLE_MAGIC)
    output.extend(struct.pack("<H", len(rows)))
    for number, _latex in rows:
        if not 0 <= number <= 0xFFFF:
            raise ValueError("row number does not fit in the bundle format")
        output.extend(struct.pack("<H", number))
    previous_latex = b""
    for (_number, latex), height in zip(rows, heights, strict=True):
        encoded_latex = encode_latex(latex)
        prefix_length = 0
        shared_length = min(len(previous_latex), len(encoded_latex))
        while prefix_length < shared_length and previous_latex[prefix_length] == encoded_latex[prefix_length]:
            prefix_length += 1
        suffix = encoded_latex[prefix_length:]
        if not 0 < height <= 0xFF:
            raise ValueError("row height does not fit in the bundle format")
        if prefix_length > 0xFF or len(suffix) > 0xFF:
            raise ValueError("row LaTeX does not fit in the bundle format")
        output.extend(struct.pack("<BBB", height, prefix_length, len(suffix)))
        output.extend(suffix)
        previous_latex = encoded_latex
    return bytes(output)


def decode_bundle(bundle: bytes) -> list[tuple[int, int, str]]:
    if len(bundle) < 6 or bundle[:4] != BUNDLE_MAGIC:
        raise ValueError("invalid ordinal row bundle")
    row_count = struct.unpack_from("<H", bundle, 4)[0]
    row_data_offset = 6 + 2 * row_count
    if row_data_offset > len(bundle):
        raise ValueError("truncated ordinal row bundle")
    rows = []
    offset = row_data_offset
    previous_latex = b""
    for row_index in range(row_count):
        if offset + 3 > len(bundle):
            raise ValueError("truncated ordinal row bundle")
        number = struct.unpack_from("<H", bundle, 6 + 2 * row_index)[0]
        height, prefix_length, suffix_length = struct.unpack_from("<BBB", bundle, offset)
        offset += 3
        end = offset + suffix_length
        if height == 0 or prefix_length > len(previous_latex) or end > len(bundle):
            raise ValueError("truncated ordinal row bundle")
        encoded_latex = previous_latex[:prefix_length] + bundle[offset:end]
        latex = decode_latex(encoded_latex)
        rows.append((number, height, latex))
        previous_latex = encoded_latex
        offset = end
    if offset != len(bundle):
        raise ValueError("invalid ordinal row bundle size")
    return rows
