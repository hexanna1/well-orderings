function makeTerm(exponent, coefficient) {
  return Object.freeze({ exponent, coefficient });
}

function makeOrdinal(terms) {
  return Object.freeze({ terms: Object.freeze(terms) });
}

export const zero = makeOrdinal([]);

const ordinalKeyCache = new WeakMap();
const fsAtCache = new Map();
const childrenCache = new Map();

function ordinalKey(ordinal) {
  const cached = ordinalKeyCache.get(ordinal);
  if (cached !== undefined) {
    return cached;
  }
  const key = `O(${ordinal.terms
    .map(({ exponent, coefficient }) => `T(${ordinalKey(exponent)},${coefficient})`)
    .join("")})`;
  ordinalKeyCache.set(ordinal, key);
  return key;
}

function assertOrdinal(ordinal, name = "ordinal") {
  if (!ordinal || typeof ordinal !== "object" || !Array.isArray(ordinal.terms)) {
    throw new TypeError(`${name} must be a Cantor ordinal`);
  }
  return ordinal;
}

function assertNonnegativeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a nonnegative safe integer`);
  }
}

function assertPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function readRawTerm(raw) {
  if (Array.isArray(raw) && raw.length === 2) {
    return { exponent: raw[0], coefficient: raw[1] };
  }
  if (raw && typeof raw === "object") {
    return {
      exponent: raw.exponent ?? raw.exp,
      coefficient: raw.coefficient ?? raw.coeff,
    };
  }
  throw new TypeError("term must be [exponent, coefficient] or an object term");
}

function compare(a, b) {
  assertOrdinal(a, "a");
  assertOrdinal(b, "b");

  if (a === b) {
    return 0;
  }
  if (isZero(a)) {
    return isZero(b) ? 0 : -1;
  }
  if (isZero(b)) {
    return 1;
  }

  let index = 0;
  while (index < a.terms.length || index < b.terms.length) {
    if (index >= a.terms.length) {
      return -1;
    }
    if (index >= b.terms.length) {
      return 1;
    }

    const aTerm = a.terms[index];
    const bTerm = b.terms[index];
    const exponentCmp = compare(aTerm.exponent, bTerm.exponent);
    if (exponentCmp !== 0) {
      return exponentCmp;
    }
    if (aTerm.coefficient !== bTerm.coefficient) {
      return aTerm.coefficient < bTerm.coefficient ? -1 : 1;
    }
    index += 1;
  }
  return 0;
}

function fromTerms(terms) {
  if (!terms || typeof terms[Symbol.iterator] !== "function") {
    throw new TypeError("terms must be iterable");
  }

  const merged = [];
  for (const raw of terms) {
    const { exponent, coefficient } = readRawTerm(raw);
    assertOrdinal(exponent, "term exponent");
    assertPositiveInteger(coefficient, "term coefficient");

    const existingIndex = merged.findIndex((term) => compare(term.exponent, exponent) === 0);
    if (existingIndex === -1) {
      merged.push(makeTerm(exponent, coefficient));
      continue;
    }

    const existing = merged[existingIndex];
    const nextCoefficient = existing.coefficient + coefficient;
    assertPositiveInteger(nextCoefficient, "merged coefficient");
    merged[existingIndex] = makeTerm(existing.exponent, nextCoefficient);
  }

  if (merged.length === 0) {
    return zero;
  }
  merged.sort((a, b) => compare(b.exponent, a.exponent));
  return makeOrdinal(merged);
}

export function omegaPower(exponent, coefficient = 1) {
  assertOrdinal(exponent, "exponent");
  assertPositiveInteger(coefficient, "coefficient");
  return fromTerms([[exponent, coefficient]]);
}

function isZero(ordinal) {
  assertOrdinal(ordinal);
  return ordinal.terms.length === 0;
}

function isOne(ordinal) {
  return (
    ordinal.terms.length === 1 &&
    isZero(ordinal.terms[0].exponent) &&
    ordinal.terms[0].coefficient === 1
  );
}

function equals(a, b) {
  return compare(a, b) === 0;
}

export function toLatex(ordinal) {
  assertOrdinal(ordinal);
  if (isZero(ordinal)) {
    return "0";
  }
  return ordinal.terms
    .map(({ exponent, coefficient }) => {
      if (isZero(exponent)) {
        return String(coefficient);
      }
      const base = isOne(exponent) ? "\\omega" : `\\omega^{${toLatex(exponent)}}`;
      return coefficient === 1 ? base : `${base}${coefficient}`;
    })
    .join("+");
}

export function predecessor(ordinal) {
  assertOrdinal(ordinal);
  if (isZero(ordinal)) {
    return null;
  }

  const terms = ordinal.terms.slice();
  const lastIndex = terms.length - 1;
  const lastTerm = terms[lastIndex];
  if (!isZero(lastTerm.exponent)) {
    return null;
  }

  if (lastTerm.coefficient === 1) {
    terms.pop();
  } else {
    terms[lastIndex] = makeTerm(lastTerm.exponent, lastTerm.coefficient - 1);
  }
  return terms.length === 0 ? zero : makeOrdinal(terms);
}

function isLimit(ordinal) {
  assertOrdinal(ordinal);
  return !isZero(ordinal) && predecessor(ordinal) === null;
}

function splitLastUnit(ordinal) {
  const terms = ordinal.terms.slice();
  const lastIndex = terms.length - 1;
  const lastTerm = terms[lastIndex];
  const active = makeOrdinal([makeTerm(lastTerm.exponent, 1)]);

  if (lastTerm.coefficient === 1) {
    terms.pop();
  } else {
    terms[lastIndex] = makeTerm(lastTerm.exponent, lastTerm.coefficient - 1);
  }

  return {
    prefix: terms.length === 0 ? zero : makeOrdinal(terms),
    active,
  };
}

function appendLowerOrderSuffix(prefix, suffix) {
  if (isZero(prefix)) {
    return suffix;
  }
  if (isZero(suffix)) {
    return prefix;
  }

  const prefixLast = prefix.terms[prefix.terms.length - 1].exponent;
  const suffixFirst = suffix.terms[0].exponent;
  if (compare(prefixLast, suffixFirst) <= 0) {
    throw new Error("suffix is not lower order than prefix");
  }
  return makeOrdinal([...prefix.terms, ...suffix.terms]);
}

function fsAtLimit(ordinal, n) {
  const { prefix, active } = splitLastUnit(ordinal);
  if (!isZero(prefix) || !equals(active, ordinal)) {
    return appendLowerOrderSuffix(prefix, fsAtLimit(active, n));
  }

  const exponent = ordinal.terms[0].exponent;
  const exponentPredecessor = predecessor(exponent);
  if (exponentPredecessor !== null) {
    return n === 0 ? zero : omegaPower(exponentPredecessor, n);
  }

  return omegaPower(fsAtLimit(exponent, n));
}

function fsAt(alpha, n) {
  assertOrdinal(alpha, "alpha");
  assertNonnegativeInteger(n, "n");
  if (!isLimit(alpha)) {
    throw new RangeError("fsAt requires a nonzero limit ordinal");
  }
  const cacheKey = `${ordinalKey(alpha)}[${n}]`;
  const cached = fsAtCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = fsAtLimit(alpha, n);
  fsAtCache.set(cacheKey, result);
  return result;
}

export function children(alpha, buttonCount = 4) {
  assertOrdinal(alpha, "alpha");
  assertNonnegativeInteger(buttonCount, "buttonCount");
  if (!isLimit(alpha)) {
    return [];
  }

  const cacheKey = `${ordinalKey(alpha)}|${buttonCount}`;
  const cached = childrenCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = [];
  for (let n = 0; n < buttonCount; n += 1) {
    result.push(fsAt(alpha, n));
  }
  const frozen = Object.freeze(result);
  childrenCache.set(cacheKey, frozen);
  return frozen;
}
