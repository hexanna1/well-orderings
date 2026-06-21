import {cachedByNumber} from "./cache.js";
import {
  admissibleRank, admissibleUnrank, boundedPrimePowerProduct, cacheIntegerValue,
} from "../natural_number_encoding.js";

const ORDINAL_KIND = "Buchholz_1Ordinal";

function freezeOrdinal(terms) { return Object.freeze({kind: ORDINAL_KIND, terms: Object.freeze(terms)}); }

export const zero = freezeOrdinal([]);

const ordinalKeyCache = new WeakMap(), supportCache = new WeakMap();
const admissibleCache = new WeakMap(), legalCache = new WeakMap();
const usesLevelCache = new WeakMap(), latexCache = new WeakMap();
const fsAtCache = new WeakMap(), childrenCache = new WeakMap();

function principal(level, arg) { return Object.freeze({level, arg}); }

function term(level, arg, coeff = 1) { return Object.freeze({principal: principal(level, arg), coeff}); }

function principalKey(item) { return `P(${item.level},${ordinalKey(item.arg)})`; }

function ordinalKey(ordinal) {
  const cached = ordinalKeyCache.get(ordinal);
  if (cached !== undefined) return cached;
  const key = `O(${ordinal.terms .map((item) => `T(${principalKey(item.principal)},${item.coeff})`) .join("")})`;
  ordinalKeyCache.set(ordinal, key);
  return key;
}

function makeOrdinal(rawTerms, checkLegal = true) {
  const grouped = new Map();

  for (const rawTerm of rawTerms) {
    const {level} = rawTerm.principal, arg = rawTerm.principal.arg, coeff = rawTerm.coeff;

    if (coeff === 0) continue;

    const item = principal(level, arg), key = principalKey(item), previous = grouped.get(key);
    grouped.set(key, {principal: item, coeff: (previous ? previous.coeff : 0) + coeff});
  }

  if (grouped.size === 0) return zero;

  const terms = Array.from(grouped.values())
    .sort((left, right) => comparePrincipal(right.principal, left.principal))
    .map((item) =>
      Object.freeze({principal: item.principal, coeff: item.coeff}),
    );

  const ordinal = freezeOrdinal(terms);
  if (checkLegal && !isLegal(ordinal)) throw new RangeError("ordinal is not in Buchholz normal form");
  return ordinal;
}

function singleton(level, arg, coeff = 1) { return makeOrdinal([term(level, arg, coeff)]); }

function finite(n) { return n === 0 ? zero : singleton(0, zero, n); }

export function psi0(arg = zero, coeff = 1) { return singleton(0, arg, coeff); }

export function psi1(arg = zero, coeff = 1) { return singleton(1, arg, coeff); }

function createRawDecoder(primeIndex, rawCodeCache = null) {
  const rawOrdinalCache = new Map();

  function rawDecode(rawCode, factors = null) {
    const rawCached = rawOrdinalCache.get(rawCode);
    if (rawCached !== undefined) return rawCached;
    const rawTerms = (factors ?? primeIndex.factorize(rawCode)).map(([prime, coeff]) => {
      const sourceIndex = primeIndex.primeIndex(prime), level = sourceIndex % 2 === 0 ? 1 : 0;
      const childCode = level === 0 ? (sourceIndex + 1) / 2 : sourceIndex / 2;
      return term(level, rawDecode(childCode), coeff);
    });
    const value = makeOrdinal(rawTerms, false);
    cacheIntegerValue(rawOrdinalCache, rawCode, value);
    rawCodeCache?.set(value, rawCode);
    return value;
  }

  return rawDecode;
}

export function createAdmissibilityScanner(primeIndex) {
  const rawDecode = createRawDecoder(primeIndex);
  return Object.freeze({rawDecode, isAdmissible: (candidate) => isAdmissible(0, candidate)});
}

export function createEncoder(primeIndex, admissibleData) {
  const ordinalCache = new Map(), naturalCache = new WeakMap();
  const rawCodeCache = new WeakMap(), rawDecode = createRawDecoder(primeIndex, rawCodeCache);

  function ordinal(n) {
    const cached = ordinalCache.get(n);
    if (cached !== undefined) return cached;

    const terms = primeIndex.factorize(n).map(([prime, coeff]) => {
      const rank = primeIndex.primeIndex(prime);
      const arg = admissibleUnrank(rank, admissibleData, rawDecode, (candidate) => isAdmissible(0, candidate));
      return term(0, arg, coeff);
    });
    const value = makeOrdinal(terms);
    return cacheIntegerValue(ordinalCache, n, value);
  }

  function rawCode(value) {
    const cached = rawCodeCache.get(value);
    if (cached !== undefined) return cached;

    let n = 1;
    for (const {principal: principalValue, coeff} of value.terms) {
      const childCode = rawCode(principalValue.arg);
      if (childCode === null) {
        n = null;
        break;
      }
      const sourceIndex = 2 * childCode - 1 + principalValue.level;
      n = boundedPrimePowerProduct(n, sourceIndex, coeff, primeIndex);
      if (n === null) break;
    }
    rawCodeCache.set(value, n);
    return n;
  }

  function natural(value) {
    const cached = naturalCache.get(value);
    if (cached !== undefined) return cached;
    if (
      !isLegal(value) ||
      value.terms.some(({principal: principalValue}) => principalValue.level !== 0)
    ) {
      naturalCache.set(value, null);
      return null;
    }

    let n = 1;
    for (const {principal: principalValue, coeff} of value.terms) {
      const rank = admissibleRank(
        principalValue.arg,
        admissibleData,
        rawCode,
        rawDecode,
        (candidate) => isAdmissible(0, candidate),
      );
      n = boundedPrimePowerProduct(n, rank, coeff, primeIndex);
      if (n === null) break;
    }
    naturalCache.set(value, n);
    return n;
  }

  return Object.freeze({ordinal, natural});
}

const one = finite(1);

function comparePrincipal(left, right) {
  if (left === right) return 0;
  if (left.level !== right.level) return left.level < right.level ? -1 : 1;
  return compare(left.arg, right.arg);
}

function compare(left, right) {
  if (left === right) return 0;

  const length = Math.max(left.terms.length, right.terms.length);
  for (let i = 0; i < length; i += 1) {
    if (i >= left.terms.length) return -1;
    if (i >= right.terms.length) return 1;

    const aTerm = left.terms[i], bTerm = right.terms[i];
    const head = comparePrincipal(aTerm.principal, bTerm.principal);
    if (head !== 0) return head;
    if (aTerm.coeff !== bTerm.coeff) return aTerm.coeff < bTerm.coeff ? -1 : 1;
  }
  return 0;
}

function equals(left, right) { return compare(left, right) === 0; }

function isPrincipalOne(item) { return item.level === 0 && isZero(item.arg); }

function withCoeffLatex(rendered, coeff) { return coeff === 1 ? rendered : `${rendered}${coeff}`; }

function termToLatex(item, coeff) {
  if (isPrincipalOne(item)) return String(coeff);
  return withCoeffLatex(principalToLatex(item), coeff);
}

function usesLevel(ordinal, level) {
  return cachedByNumber(usesLevelCache, ordinal, level, () =>
    ordinal.terms.some((item) => item.principal.level === level || usesLevel(item.principal.arg, level)),
  );
}

function isBelowEpsilon0(ordinal) { return !usesLevel(ordinal, 1); }

function startsAboveLevel(ordinal, level) { return ordinal.terms.length > 0 && ordinal.terms[0].principal.level > level; }

function isEpsilonNumber(ordinal) {
  if (ordinal.terms.length !== 1) return false;
  const [item] = ordinal.terms;
  return item.coeff === 1 && startsAboveLevel(item.principal.arg, item.principal.level);
}

function omegaPowerLatex(exponent) {
  if (isZero(exponent)) return "1";
  if (equals(exponent, one)) return "\\omega";
  return `\\omega^{${ordinalToLatex(exponent)}}`;
}

function renderedFinite(n) { return Object.freeze({latex: String(n), finiteNat: n}); }

function rendered(latex, finiteNat = null) { return Object.freeze({latex, finiteNat}); }

function isRenderedZero(value) { return value.finiteNat === 0; }

function sumRenderedOrdinal(parts) {
  const filtered = parts.filter((part) => !isRenderedZero(part));
  if (filtered.length === 0) return renderedFinite(0);

  let finiteTotal = 0;
  const nonfiniteParts = [];
  let allFinite = true;

  for (const part of filtered) {
    if (part.finiteNat === null) {
      allFinite = false;
      nonfiniteParts.push(part.latex);
    } else {
      finiteTotal += part.finiteNat;
    }
  }

  if (allFinite) return renderedFinite(finiteTotal);
  if (finiteTotal) nonfiniteParts.push(String(finiteTotal));
  return rendered(nonfiniteParts.join("+"));
}

function onePlusRenderedOrdinal(value) {
  if (value.finiteNat !== null) return renderedFinite(value.finiteNat + 1);
  return value;
}

function omegaBasePowerLatex(exponent) {
  if (isRenderedZero(exponent)) return "1";
  if (exponent.finiteNat === 1) return "\\Omega";
  return `\\Omega^{${exponent.latex}}`;
}

function omegaTailLatex(tail) {
  if (isZero(tail)) return "";
  if (equals(tail, one)) return "\\omega";
  if (isEpsilonNumber(tail)) return ordinalToLatex(tail);
  return `\\omega^{${ordinalToLatex(tail)}}`;
}

function omegaBaseMonomialLatex(exponent, omegaTail) {
  const head = omegaBasePowerLatex(exponent), tail = omegaTailLatex(omegaTail);
  if (head === "1") return tail || "1";
  return `${head}${tail}`;
}

function withRenderedCoeff(value, coeff) {
  if (value.finiteNat !== null) return renderedFinite(value.finiteNat * coeff);
  return coeff === 1 ? value : rendered(withCoeffLatex(value.latex, coeff));
}

function decomposeOmegaMultiple(ordinal) {
  const quotientParts = [], tailTerms = [];

  for (const item of ordinal.terms) {
    if (item.principal.level === 1) {
      quotientParts.push(withRenderedCoeff(omegaPowerRendered(item.principal.arg), item.coeff));
    } else {
      tailTerms.push(item);
    }
  }

  return {quotient: sumRenderedOrdinal(quotientParts), tail: makeOrdinal(tailTerms)};
}

function omegaPowerRendered(exponent) {
  if (isEpsilonNumber(exponent)) return rendered(ordinalToLatex(exponent));

  const {quotient, tail} = decomposeOmegaMultiple(exponent);
  if (isRenderedZero(quotient)) {
    if (isZero(tail)) return renderedFinite(1);
    if (equals(tail, one)) return rendered("\\omega");
    return rendered(`\\omega^{${ordinalToLatex(tail)}}`);
  }

  return rendered(omegaBaseMonomialLatex(quotient, tail));
}

function omegaExprLatex(ordinal) {
  const parts = ordinal.terms.map((item) => {
    if (item.principal.level === 1) return withCoeffLatex(psi1AsOmegaLatex(item.principal.arg), item.coeff);
    return termToLatex(item.principal, item.coeff);
  });
  return parts.length ? parts.join("+") : "0";
}

function psi1AsOmegaLatex(arg) {
  const {quotient, tail} = decomposeOmegaMultiple(arg), exponent = onePlusRenderedOrdinal(quotient);
  return omegaBaseMonomialLatex(exponent, tail);
}

function principalToLatex(item) {
  if (item.level === 0) {
    if (isBelowEpsilon0(item.arg)) return omegaPowerLatex(item.arg);
    return `\\psi(${omegaExprLatex(item.arg)})`;
  }

  return psi1AsOmegaLatex(item.arg);
}

function ordinalToLatex(ordinal) {
  const cached = latexCache.get(ordinal);
  if (cached !== undefined) return cached;
  let result;
  if (isZero(ordinal)) {
    result = "0";
  } else {
    result = ordinal.terms .map((item) => termToLatex(item.principal, item.coeff)) .join("+");
  }
  latexCache.set(ordinal, result);
  return result;
}

export function toLatex(ordinal) { return ordinalToLatex(ordinal); }

function isZero(ordinal) { return ordinal.terms.length === 0; }

function predecessorIfSuccessor(ordinal) {
  if (isZero(ordinal)) return null;

  const terms = ordinal.terms.slice(), last = terms[terms.length - 1];
  if (!isPrincipalOne(last.principal)) return null;

  if (last.coeff === 1) {
    terms.pop();
  } else {
    terms[terms.length - 1] = term(0, zero, last.coeff - 1);
  }
  return makeOrdinal(terms);
}

export function predecessor(ordinal) { return predecessorIfSuccessor(ordinal); }

function isLimit(ordinal) { return !isZero(ordinal) && predecessorIfSuccessor(ordinal) === null; }

function finiteNat(ordinal) {
  if (isZero(ordinal)) return 0;
  if (ordinal.terms.length !== 1) return null;

  const [item] = ordinal.terms;
  return isPrincipalOne(item.principal) ? item.coeff : null;
}

function topLevelIsCountable(ordinal) { return ordinal.terms.every((item) => item.principal.level === 0); }

function lastTermSplit(ordinal) {
  if (isZero(ordinal)) return null;

  const prefixTerms = ordinal.terms.slice(), last = prefixTerms[prefixTerms.length - 1];
  if (last.coeff === 1) {
    prefixTerms.pop();
  } else {
    prefixTerms[prefixTerms.length - 1] = term(last.principal.level, last.principal.arg, last.coeff - 1);
  }

  return {prefixTerms, active: makeOrdinal([term(last.principal.level, last.principal.arg, 1)])};
}

function appendToPrefix(prefixTerms, suffix) {
  try {
    return isZero(suffix)
      ? makeOrdinal(prefixTerms)
      : makeOrdinal([...prefixTerms, ...suffix.terms]);
  } catch {
    return null;
  }
}

function cofinalityKind(ordinal) {
  if (isZero(ordinal)) return "zero";
  if (predecessorIfSuccessor(ordinal) !== null) return "one";

  const split = lastTermSplit(ordinal);
  if (!split) return "zero";

  const {active} = split;
  if (active.terms.length !== 1) return "omega";

  const [item] = active.terms, head = item.principal;
  if (head.level === 0) return isZero(head.arg) ? "one" : "omega";

  if (isZero(head.arg)) return "uncountable";
  if (predecessorIfSuccessor(head.arg) !== null) return "omega";
  return cofinalityKind(head.arg) === "uncountable" ? "uncountable" : "omega";
}

function termOrNull(level, arg, coeff = 1) {
  try {
    return singleton(level, arg, coeff);
  } catch {
    return null;
  }
}

function uncountableArgumentApproximants(arg, depth) {
  const approximants = [];
  let gamma = one;

  for (let i = 0; i < depth; i += 1) {
    const argAtGamma = fsAtOrdinal(arg, gamma);
    if (argAtGamma === null) break;

    const row = termOrNull(0, argAtGamma);
    if (row === null || approximants.some((seen) => equals(seen, row))) break;

    approximants.push(row);
    gamma = row;
  }

  return approximants;
}

function fsAtOrdinal(ordinal, index) {
  if (!isLimit(ordinal)) return null;

  const split = lastTermSplit(ordinal);
  if (!split) return null;

  const {prefixTerms, active} = split;
  if (prefixTerms.length > 0 || !equals(active, ordinal)) {
    const activeAt = fsAtOrdinal(active, index);
    return activeAt === null ? null : appendToPrefix(prefixTerms, activeAt);
  }

  const [item] = ordinal.terms, head = item.principal;

  if (head.level === 1 && isZero(head.arg)) return topLevelIsCountable(index) ? index : null;

  const argPredecessor = predecessorIfSuccessor(head.arg);
  if (argPredecessor !== null) {
    const n = finiteNat(index);
    if (n === null) return null;
    return n === 0 ? zero : termOrNull(head.level, argPredecessor, n);
  }

  if (head.level === 0 && cofinalityKind(head.arg) === "uncountable") {
    const n = finiteNat(index);
    if (n === null) return null;
    const approximants = uncountableArgumentApproximants(head.arg, n + 1);
    return approximants.length === 0 ? null : approximants[approximants.length - 1];
  }

  const argAt = fsAtOrdinal(head.arg, index);
  return argAt === null ? null : termOrNull(head.level, argAt);
}

function fsAt(alpha, n) {
  if (!isLimit(alpha)) throw new RangeError("alpha must be a nonzero limit ordinal");

  return cachedByNumber(fsAtCache, alpha, n, () => {
    const result = fsAtOrdinal(alpha, finite(n));
    if (result === null) throw new RangeError("fundamental-sequence value is undefined here");
    return result;
  });
}

export function children(alpha, buttonCount = 4) {
  if (!isLimit(alpha)) return [];

  return cachedByNumber(childrenCache, alpha, buttonCount, () => {
    const result = [];
    for (let n = 0; n < buttonCount; n += 1) { result.push(fsAt(alpha, n)); }
    return Object.freeze(result);
  });
}

function addSupport(result, ordinal) { result.set(ordinalKey(ordinal), ordinal); }

function supportPrincipal(level, item) {
  if (level > item.level) return [];

  const result = new Map();
  addSupport(result, item.arg);
  for (const guarded of support(level, item.arg)) { addSupport(result, guarded); }
  return Array.from(result.values());
}

function support(level, ordinal) {
  return cachedByNumber(supportCache, ordinal, level, () => {
    const result = new Map();
    for (const item of ordinal.terms) {
      for (const guarded of supportPrincipal(level, item.principal)) { addSupport(result, guarded); }
    }
    return Object.freeze(Array.from(result.values()));
  });
}

function isAdmissible(level, arg) {
  return cachedByNumber(admissibleCache, arg, level, () =>
    isLegal(arg) &&
    support(level, arg).every((guarded) => compare(guarded, arg) < 0),
  );
}

function isLegal(ordinal) {
  const cached = legalCache.get(ordinal);
  if (cached !== undefined) return cached;
  const result = ordinal.terms.every((item) => isAdmissible(item.principal.level, item.principal.arg));
  legalCache.set(ordinal, result);
  return result;
}
