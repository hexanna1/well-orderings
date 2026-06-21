const ORDINAL_KIND = "transfinitary-veblen-ordinal";
const MATRIX_KIND = "transfinitary-veblen-matrix";

function uncheckedMatrix(entries) {
  return Object.freeze({
    kind: MATRIX_KIND,
    entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
  });
}

function uncheckedTerm(matrixValue, coefficient) {
  return Object.freeze({
    matrix: matrixValue,
    coefficient,
  });
}

function uncheckedOrdinal(terms) {
  return Object.freeze({
    kind: ORDINAL_KIND,
    terms: Object.freeze(terms),
  });
}

export const zero = uncheckedOrdinal([]);
const matrixOne = uncheckedMatrix([]);
export const one = uncheckedOrdinal([uncheckedTerm(matrixOne, 1)]);
const two = uncheckedOrdinal([uncheckedTerm(matrixOne, 2)]);

const ordinalKeyCache = new WeakMap();
const matrixKeyCache = new WeakMap();
const ordinalCompareCache = new Map();
const matrixCompareCache = new Map();
const predecessorCache = new Map();
const limitCache = new Map();
const fsAtCache = new Map();
const childrenCache = new Map();

function keyOfMatrix(matrixValue) {
  const cached = matrixKeyCache.get(matrixValue);
  if (cached !== undefined) {
    return cached;
  }
  const key = `M(${matrixValue.entries
    .map(([position, value]) => `E(${keyOfOrdinal(position)},${keyOfOrdinal(value)})`)
    .join("")})`;
  matrixKeyCache.set(matrixValue, key);
  return key;
}

function keyOfOrdinal(ordinal) {
  const cached = ordinalKeyCache.get(ordinal);
  if (cached !== undefined) {
    return cached;
  }
  const key = `O(${ordinal.terms
    .map(({ matrix, coefficient }) => `T(${keyOfMatrix(matrix)},${coefficient})`)
    .join("")})`;
  ordinalKeyCache.set(ordinal, key);
  return key;
}

function pairKey(leftKey, rightKey) {
  return `${leftKey}<=>${rightKey}`;
}

function assertSafeNonnegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a nonnegative safe integer`);
  }
}

function assertSafePositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function safeAdd(a, b, name) {
  const value = a + b;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} exceeds JavaScript's safe integer range`);
  }
  return value;
}

function safeMultiply(a, b, name) {
  const value = a * b;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} exceeds JavaScript's safe integer range`);
  }
  return value;
}

function isOrdinalObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    value.kind === ORDINAL_KIND &&
    Array.isArray(value.terms)
  );
}

function isMatrixObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    value.kind === MATRIX_KIND &&
    Array.isArray(value.entries)
  );
}

function asOrdinal(value) {
  if (Number.isSafeInteger(value) && value >= 0) {
    return finite(value);
  }
  if (isOrdinalObject(value)) {
    return value;
  }
  if (value !== null && typeof value === "object" && Array.isArray(value.terms)) {
    return fromTerms(value.terms);
  }
  throw new TypeError("expected a Transfinitary Veblen ordinal");
}

function asMatrix(value) {
  if (isMatrixObject(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return matrix(value);
  }
  if (value !== null && typeof value === "object" && Array.isArray(value.entries)) {
    return matrix(value.entries);
  }
  throw new TypeError("expected a Transfinitary Veblen matrix");
}

function readEntry(raw) {
  if (Array.isArray(raw) && raw.length === 2) {
    return { position: raw[0], value: raw[1] };
  }
  if (raw !== null && typeof raw === "object") {
    return {
      position: raw.position ?? raw.pos,
      value: raw.value ?? raw.val,
    };
  }
  throw new TypeError("matrix entry must be [position, value] or an object");
}

function readTerm(raw) {
  if (Array.isArray(raw) && raw.length === 2) {
    return { matrix: raw[0], coefficient: raw[1] };
  }
  if (raw !== null && typeof raw === "object") {
    return {
      matrix: raw.matrix ?? raw.entries,
      coefficient: raw.coefficient ?? raw.coeff ?? 1,
    };
  }
  throw new TypeError("normal-form term must be [matrix, coefficient] or an object");
}

function ordinalEquals(left, right) {
  const a = asOrdinal(left);
  const b = asOrdinal(right);
  if (a.terms.length !== b.terms.length) {
    return false;
  }
  for (let i = 0; i < a.terms.length; i += 1) {
    const at = a.terms[i];
    const bt = b.terms[i];
    if (at.coefficient !== bt.coefficient || !matrixEquals(at.matrix, bt.matrix)) {
      return false;
    }
  }
  return true;
}

function matrixEquals(left, right) {
  const a = asMatrix(left);
  const b = asMatrix(right);
  if (a.entries.length !== b.entries.length) {
    return false;
  }
  for (let i = 0; i < a.entries.length; i += 1) {
    const [ap, av] = a.entries[i];
    const [bp, bv] = b.entries[i];
    if (!ordinalEquals(ap, bp) || !ordinalEquals(av, bv)) {
      return false;
    }
  }
  return true;
}

function matrix(entries = []) {
  const source = isMatrixObject(entries)
    ? entries.entries
    : entries && typeof entries === "object" && !Array.isArray(entries) && Array.isArray(entries.entries)
      ? entries.entries
      : entries;

  if (!source || typeof source[Symbol.iterator] !== "function") {
    throw new TypeError("matrix entries must be iterable");
  }

  const normalized = [];
  for (const raw of source) {
    const { position, value } = readEntry(raw);
    const entryPosition = canonicalizeOrdinal(asOrdinal(position));
    const entryValue = canonicalizeOrdinal(asOrdinal(value));
    if (isZero(entryValue)) {
      continue;
    }
    if (normalized.some(([seenPosition]) => compareOrdinal(seenPosition, entryPosition) === 0)) {
      throw new RangeError("matrix positions must be distinct");
    }
    normalized.push([entryPosition, entryValue]);
  }

  normalized.sort((a, b) => -compareOrdinal(a[0], b[0]));
  return uncheckedMatrix(normalized);
}

function fromTerms(terms = []) {
  if (!terms || typeof terms[Symbol.iterator] !== "function") {
    throw new TypeError("terms must be iterable");
  }

  const grouped = [];
  for (const raw of terms) {
    const parsed = readTerm(raw);
    assertSafePositiveInteger(parsed.coefficient, "coefficient");
    const termMatrix = asMatrix(parsed.matrix);
    if (!isPreferredMatrix(termMatrix)) {
      throw new RangeError("ordinal is not in preferred transfinitary Veblen normal form");
    }

    const existingIndex = grouped.findIndex((item) => compareMatrix(item.matrix, termMatrix) === 0);
    if (existingIndex === -1) {
      grouped.push(uncheckedTerm(termMatrix, parsed.coefficient));
    } else {
      const existing = grouped[existingIndex];
      grouped[existingIndex] = uncheckedTerm(
        existing.matrix,
        safeAdd(existing.coefficient, parsed.coefficient, "coefficient"),
      );
    }
  }

  if (grouped.length === 0) {
    return zero;
  }

  grouped.sort((a, b) => -compareMatrix(a.matrix, b.matrix));
  return uncheckedOrdinal(grouped);
}

function finite(n) {
  assertSafeNonnegativeInteger(n, "n");
  return n === 0 ? zero : uncheckedOrdinal([uncheckedTerm(matrixOne, n)]);
}

function matrixTerm(matrixValue = matrixOne, coefficient = 1) {
  assertSafePositiveInteger(coefficient, "coefficient");
  return uncheckedTerm(matrix(matrixValue), coefficient);
}

export function principal(entries = [], coefficient = 1) {
  return fromTerms([matrixTerm(matrix(entries), coefficient)]);
}

function term(entries = [], coefficient = 1, tail = zero) {
  const head = principal(entries, coefficient);
  return sum(head, tail);
}

function sum(...ordinals) {
  return fromTerms(ordinals.flatMap((ordinal) => asOrdinal(ordinal).terms));
}

function isZero(ordinal) {
  return asOrdinal(ordinal).terms.length === 0;
}

function isOne(ordinal) {
  return asFiniteNat(ordinal) === 1;
}

function isMatrixOne(matrixValue) {
  return asMatrix(matrixValue).entries.length === 0;
}

function asFiniteNat(ordinal) {
  const value = asOrdinal(ordinal);
  if (isZero(value)) {
    return 0;
  }
  if (value.terms.length !== 1) {
    return null;
  }
  const [only] = value.terms;
  return isMatrixOne(only.matrix) ? only.coefficient : null;
}

function canonicalizeOrdinal(ordinal) {
  const value = asOrdinal(ordinal);
  return isZero(value) ? zero : fromTerms(value.terms);
}

function ordinalFromMatrixUnchecked(matrixValue) {
  return uncheckedOrdinal([uncheckedTerm(asMatrix(matrixValue), 1)]);
}

function principalFromMatrix(matrixValue) {
  return fromTerms([matrixTerm(matrixValue, 1)]);
}

function matrixOrdinalValue(matrixValue) {
  const value = asMatrix(matrixValue);
  if (isPreferredMatrix(value)) {
    return principalFromMatrix(value);
  }

  const rawOrdinal = ordinalFromMatrixUnchecked(value);
  for (const [, entryValue] of value.entries) {
    if (compareOrdinal(entryValue, rawOrdinal) === 0) {
      return entryValue;
    }
  }
  throw new RangeError("matrix descriptor is not preferred and is not a fixed-point alias");
}

function entryValue(entries, position) {
  for (const [entryPosition, value] of entries) {
    if (compareOrdinal(entryPosition, position) === 0) {
      return value;
    }
  }
  return zero;
}

function withEntry(entries, position, value) {
  const entryPosition = asOrdinal(position);
  const entryValueToSet = asOrdinal(value);
  const replaced = [];
  let found = false;

  for (const [currentPosition, currentValue] of entries) {
    if (compareOrdinal(currentPosition, entryPosition) === 0) {
      found = true;
      if (!isZero(entryValueToSet)) {
        replaced.push([entryPosition, entryValueToSet]);
      }
    } else {
      replaced.push([currentPosition, currentValue]);
    }
  }

  if (!found && !isZero(entryValueToSet)) {
    replaced.push([entryPosition, entryValueToSet]);
  }
  return matrix(replaced);
}

function withoutEntry(entries, position) {
  return withEntry(entries, position, zero);
}

function positionsUnion(aEntries, bEntries) {
  const result = [];
  for (const [position] of [...aEntries, ...bEntries]) {
    if (!result.some((seen) => compareOrdinal(seen, position) === 0)) {
      result.push(position);
    }
  }
  result.sort((a, b) => -compareOrdinal(a, b));
  return result;
}

function compareLesserRemainder(lesserEntries, differingPosition, greaterOrdinal) {
  for (const [position, value] of lesserEntries) {
    if (compareOrdinal(position, differingPosition) >= 0) {
      continue;
    }

    const valueCmp = compareOrdinal(value, greaterOrdinal);
    if (valueCmp < 0) {
      continue;
    }
    if (valueCmp > 0) {
      return 1;
    }

    for (const [lowerPosition] of lesserEntries) {
      if (compareOrdinal(lowerPosition, position) < 0) {
        return 1;
      }
    }
    return 0;
  }
  return -1;
}

function compareMatrix(a, b) {
  let left = asMatrix(a);
  let right = asMatrix(b);
  if (needsMatrixCanonicalization(left)) {
    left = matrix(left.entries);
  }
  if (needsMatrixCanonicalization(right)) {
    right = matrix(right.entries);
  }

  const leftKey = keyOfMatrix(left);
  const rightKey = keyOfMatrix(right);
  if (leftKey === rightKey) {
    return 0;
  }
  const cacheKey = pairKey(leftKey, rightKey);
  const cached = matrixCompareCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let result = 0;
  for (const position of positionsUnion(left.entries, right.entries)) {
    const leftValue = entryValue(left.entries, position);
    const rightValue = entryValue(right.entries, position);
    const valueCmp = compareOrdinal(leftValue, rightValue);
    if (valueCmp === 0) {
      continue;
    }
    if (valueCmp < 0) {
      result = compareLesserRemainder(left.entries, position, ordinalFromMatrixUnchecked(right));
      break;
    }
    result = -compareLesserRemainder(right.entries, position, ordinalFromMatrixUnchecked(left));
    break;
  }
  matrixCompareCache.set(cacheKey, result);
  matrixCompareCache.set(pairKey(rightKey, leftKey), -result);
  return result;
}

function compareOrdinal(a, b) {
  const left = asOrdinal(a);
  const right = asOrdinal(b);
  const leftKey = keyOfOrdinal(left);
  const rightKey = keyOfOrdinal(right);
  if (leftKey === rightKey) {
    return 0;
  }
  const cacheKey = pairKey(leftKey, rightKey);
  const cached = ordinalCompareCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  if (isZero(left)) {
    ordinalCompareCache.set(cacheKey, -1);
    ordinalCompareCache.set(pairKey(rightKey, leftKey), 1);
    return -1;
  }
  if (isZero(right)) {
    ordinalCompareCache.set(cacheKey, 1);
    ordinalCompareCache.set(pairKey(rightKey, leftKey), -1);
    return 1;
  }

  let i = 0;
  let result = 0;
  while (true) {
    if (i >= left.terms.length && i >= right.terms.length) {
      result = 0;
      break;
    }
    if (i >= left.terms.length) {
      result = -1;
      break;
    }
    if (i >= right.terms.length) {
      result = 1;
      break;
    }

    const leftTerm = left.terms[i];
    const rightTerm = right.terms[i];
    const headCmp = compareMatrix(leftTerm.matrix, rightTerm.matrix);
    if (headCmp !== 0) {
      result = headCmp;
      break;
    }
    if (leftTerm.coefficient !== rightTerm.coefficient) {
      result = leftTerm.coefficient < rightTerm.coefficient ? -1 : 1;
      break;
    }
    i += 1;
  }
  ordinalCompareCache.set(cacheKey, result);
  ordinalCompareCache.set(pairKey(rightKey, leftKey), -result);
  return result;
}

function needsMatrixCanonicalization(matrixValue) {
  const value = asMatrix(matrixValue);
  const seen = [];
  let previousPosition = null;
  for (const [position, entryOrdinal] of value.entries) {
    if (isZero(entryOrdinal)) {
      return true;
    }
    if (previousPosition !== null && compareOrdinal(previousPosition, position) <= 0) {
      return true;
    }
    if (seen.some((item) => compareOrdinal(item, position) === 0)) {
      return true;
    }
    seen.push(position);
    previousPosition = position;
  }
  return false;
}

function isPreferredMatrix(matrixValue) {
  const value = asMatrix(matrixValue);
  const ordinal = ordinalFromMatrixUnchecked(value);
  return value.entries.every(
    ([position, entryOrdinal]) =>
      compareOrdinal(position, ordinal) < 0 && compareOrdinal(entryOrdinal, ordinal) < 0,
  );
}

function matrixToLatex(matrixValue) {
  const value = asMatrix(matrixValue);
  const ordinal = ordinalFromMatrixUnchecked(value);
  if (compareOrdinal(ordinal, gammaFixedPoint) < 0) {
    const named = initialNamedLatex(value);
    if (named !== null) {
      return named;
    }
  }

  if (compareOrdinal(ordinal, gammaFixedPoint) < 0 && isBinaryMatrix(value)) {
    return binaryFragmentToLatex(value);
  }

  const top = value.entries.map(([, entryOrdinal]) => toLatex(entryOrdinal)).join("&");
  const bottom = value.entries.map(([position]) => toLatex(position)).join("&");
  return `\\begin{pmatrix}${top}\\\\${bottom}\\end{pmatrix}`;
}

function initialNamedLatex(matrixValue) {
  const omegaExponentValue = omegaExponent(matrixValue);
  if (omegaExponentValue !== null) {
    if (isOne(omegaExponentValue)) {
      return "\\omega";
    }
    return `\\omega^{${toLatex(omegaExponentValue)}}`;
  }

  let gamma = binaryNamedSubscript(matrixValue, one);
  if (gamma !== null) {
    return `\\varepsilon_{${toLatex(gamma)}}`;
  }

  gamma = binaryNamedSubscript(matrixValue, two);
  if (gamma !== null) {
    return `\\zeta_{${toLatex(gamma)}}`;
  }

  gamma = gammaSubscript(matrixValue);
  if (gamma !== null) {
    return `\\Gamma_{${toLatex(gamma)}}`;
  }

  return null;
}

function omegaExponent(matrixValue) {
  const value = asMatrix(matrixValue);
  if (value.entries.length !== 1) {
    return null;
  }
  const [position, entryOrdinal] = value.entries[0];
  return isZero(position) ? entryOrdinal : null;
}

function isBinaryMatrix(matrixValue) {
  return asMatrix(matrixValue).entries.every(
    ([position]) => compareOrdinal(position, zero) === 0 || compareOrdinal(position, one) === 0,
  );
}

function binaryNamedSubscript(matrixValue, beta) {
  const entries = asMatrix(matrixValue).entries;
  if (compareOrdinal(entryValue(entries, one), beta) !== 0) {
    return null;
  }
  const gamma = entryValue(entries, zero);
  const expectedEntries = isZero(gamma) ? 1 : 2;
  return entries.length === expectedEntries ? gamma : null;
}

function gammaSubscript(matrixValue) {
  const entries = asMatrix(matrixValue).entries;
  if (compareOrdinal(entryValue(entries, two), one) !== 0) {
    return null;
  }
  if (!isZero(entryValue(entries, one))) {
    return null;
  }
  const gamma = entryValue(entries, zero);
  const expectedEntries = isZero(gamma) ? 1 : 2;
  return entries.length === expectedEntries ? gamma : null;
}

function binaryFragmentToLatex(matrixValue) {
  const entries = asMatrix(matrixValue).entries;
  const gamma = entryValue(entries, zero);
  const beta = entryValue(entries, one);

  if (isZero(beta)) {
    if (isZero(gamma)) {
      return "1";
    }
    if (isOne(gamma)) {
      return "\\omega";
    }
    return `\\omega^{${toLatex(gamma)}}`;
  }

  const betaNat = asFiniteNat(beta);
  if (betaNat === 1) {
    return `\\varepsilon_{${toLatex(gamma)}}`;
  }
  if (betaNat === 2) {
    return `\\zeta_{${toLatex(gamma)}}`;
  }
  return `\\varphi_{${toLatex(beta)}}(${toLatex(gamma)})`;
}

export function toLatex(ordinal) {
  const value = asOrdinal(ordinal);
  if (isZero(value)) {
    return "0";
  }

  const parts = [];
  for (const { matrix: matrixValueForTerm, coefficient } of value.terms) {
    if (isMatrixOne(matrixValueForTerm)) {
      parts.push(String(coefficient));
      continue;
    }

    const rendered = matrixToLatex(matrixValueForTerm);
    parts.push(coefficient > 1 ? `${rendered}${coefficient}` : rendered);
  }
  return parts.join("+");
}

export function predecessor(ordinal) {
  const value = asOrdinal(ordinal);
  const cacheKey = keyOfOrdinal(value);
  const cached = predecessorCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  let result;
  if (isZero(value)) {
    result = null;
  } else {
    const terms = value.terms.slice();
    const lastIndex = terms.length - 1;
    const last = terms[lastIndex];
    if (!isMatrixOne(last.matrix)) {
      result = null;
    } else {
      if (last.coefficient === 1) {
        terms.pop();
      } else {
        terms[lastIndex] = uncheckedTerm(matrixOne, last.coefficient - 1);
      }
      result = fromTerms(terms);
    }
  }
  predecessorCache.set(cacheKey, result);
  return result;
}

function isLimit(ordinal) {
  const value = asOrdinal(ordinal);
  const cacheKey = keyOfOrdinal(value);
  const cached = limitCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = !isZero(value) && predecessor(value) === null;
  limitCache.set(cacheKey, result);
  return result;
}

function addFinite(ordinal, amount) {
  assertSafeNonnegativeInteger(amount, "amount");
  const value = asOrdinal(ordinal);
  if (amount === 0) {
    return value;
  }
  return fromTerms([...value.terms, uncheckedTerm(matrixOne, amount)]);
}

function multiplyPrincipalValue(ordinal, coefficient) {
  assertSafeNonnegativeInteger(coefficient, "coefficient");
  const value = asOrdinal(ordinal);
  if (coefficient === 0 || isZero(value)) {
    return zero;
  }
  if (value.terms.length !== 1) {
    throw new RangeError("expected a principal ordinal value");
  }
  const [only] = value.terms;
  return fromTerms([
    uncheckedTerm(
      only.matrix,
      safeMultiply(only.coefficient, coefficient, "coefficient"),
    ),
  ]);
}

function splitLastUnit(ordinal) {
  const value = asOrdinal(ordinal);
  const prefixTerms = value.terms.slice();
  const last = prefixTerms[prefixTerms.length - 1];
  const active = uncheckedOrdinal([uncheckedTerm(last.matrix, 1)]);

  if (last.coefficient === 1) {
    prefixTerms.pop();
  } else {
    prefixTerms[prefixTerms.length - 1] = uncheckedTerm(last.matrix, last.coefficient - 1);
  }

  return { prefixTerms, active };
}

function appendToPrefix(prefixTerms, suffix) {
  const tail = asOrdinal(suffix);
  return fromTerms([...prefixTerms, ...tail.terms]);
}

function leastEntry(matrixValue) {
  const entries = asMatrix(matrixValue).entries;
  return entries.length === 0 ? null : entries[entries.length - 1];
}

function activeOnlyMatrix(entries) {
  return entries.every(([position]) => isZero(position));
}

function lowerContextStep(contextEntries, argument, n) {
  const context = matrix(contextEntries);
  const lowest = leastEntry(context);
  if (lowest === null) {
    return matrixOrdinalValue([[zero, argument]]);
  }

  const [position, value] = lowest;
  const nextValue = isLimit(value) ? fsOrdinal(value, n) : predecessor(value);
  if (nextValue === null) {
    throw new RangeError("context entry is neither successor nor limit");
  }

  const base = withEntry(context.entries, position, nextValue);
  const positionPredecessor = predecessor(position);
  if (positionPredecessor !== null) {
    return matrixOrdinalValue(withEntry(base.entries, positionPredecessor, argument));
  }

  if (isLimit(position)) {
    const positionAtN = fsOrdinal(position, n);
    return matrixOrdinalValue(withEntry(base.entries, positionAtN, argument));
  }

  throw new RangeError("context position is neither zero, successor, nor limit");
}

function contextIsLimit(contextEntries) {
  const lowest = leastEntry(matrix(contextEntries));
  if (lowest === null) {
    return false;
  }
  const [position, value] = lowest;
  return isLimit(value) || isLimit(position);
}

function iterateLowerContext(contextEntries, seed, n) {
  if (contextIsLimit(contextEntries)) {
    return lowerContextStep(contextEntries, seed, n);
  }

  let current = asOrdinal(seed);
  for (let i = 0; i < n; i += 1) {
    current = lowerContextStep(contextEntries, current, n);
  }
  return current;
}

function iterateLowerCoordinate(baseEntries, lowerPosition, n) {
  let current = zero;
  for (let i = 0; i < n; i += 1) {
    current = matrixOrdinalValue(withEntry(baseEntries, lowerPosition, current));
  }
  return current;
}

function fsPrincipal(matrixValue, n) {
  const value = asMatrix(matrixValue);
  if (isMatrixOne(value)) {
    throw new RangeError("1 has no fundamental sequence");
  }

  const [position, entryOrdinal] = leastEntry(value);
  if (isLimit(entryOrdinal)) {
    return matrixOrdinalValue(withEntry(value.entries, position, fsOrdinal(entryOrdinal, n)));
  }

  const entryPredecessor = predecessor(entryOrdinal);
  if (entryPredecessor === null) {
    throw new RangeError("matrix entry is neither successor nor limit");
  }

  const base = withEntry(value.entries, position, entryPredecessor);
  if (isZero(position)) {
    if (activeOnlyMatrix(value.entries)) {
      return multiplyPrincipalValue(matrixOrdinalValue(base), n);
    }

    const contextEntries = withoutEntry(value.entries, zero).entries;
    const seed = addFinite(matrixOrdinalValue(base), 1);
    return iterateLowerContext(contextEntries, seed, n);
  }

  const positionPredecessor = predecessor(position);
  if (positionPredecessor !== null) {
    return iterateLowerCoordinate(base.entries, positionPredecessor, n);
  }

  if (isLimit(position)) {
    const positionAtN = fsOrdinal(position, n);
    return matrixOrdinalValue(withEntry(base.entries, positionAtN, one));
  }

  throw new RangeError("matrix position is neither zero, successor, nor limit");
}

function fsOrdinal(ordinal, n) {
  const value = asOrdinal(ordinal);
  if (!isLimit(value)) {
    throw new RangeError("fsAt requires a nonzero limit ordinal");
  }

  const { prefixTerms, active } = splitLastUnit(value);
  if (prefixTerms.length > 0 || !ordinalEquals(active, value)) {
    return appendToPrefix(prefixTerms, fsOrdinal(active, n));
  }

  const [only] = value.terms;
  return fsPrincipal(only.matrix, n);
}

function fsAt(alpha, n) {
  assertSafeNonnegativeInteger(n, "n");
  const value = asOrdinal(alpha);
  if (!isLimit(value)) {
    throw new RangeError("fsAt requires a nonzero limit ordinal");
  }
  const cacheKey = `${keyOfOrdinal(value)}[${n}]`;
  const cached = fsAtCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = fsOrdinal(value, n);
  fsAtCache.set(cacheKey, result);
  return result;
}

export function children(alpha, buttonCount = 4) {
  assertSafeNonnegativeInteger(buttonCount, "buttonCount");
  const value = asOrdinal(alpha);
  if (!isLimit(value)) {
    return [];
  }

  const cacheKey = `${keyOfOrdinal(value)}|${buttonCount}`;
  const cached = childrenCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = [];
  for (let n = 0; n < buttonCount; n += 1) {
    result.push(fsAt(value, n));
  }
  const frozen = Object.freeze(result);
  childrenCache.set(cacheKey, frozen);
  return frozen;
}

const omega = principal([[zero, one]]);

const gammaFixedPoint = principal([
  [two, one],
  [one, one],
]);
