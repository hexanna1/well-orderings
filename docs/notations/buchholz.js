import {cachedByNumber} from "./cache.js";
import {
  admissibleRank, admissibleUnrank, boundedPrimePowerProduct, cacheIntegerValue,
} from "../natural_number_encoding.js";

function makeTerm(level, arg, coefficient) { return Object.freeze({level, arg, coefficient}); }

function makeOrdinal(terms) { return Object.freeze({terms: Object.freeze(terms)}); }

const zero = makeOrdinal([]);

const ordinalKeyCache = new WeakMap(), fsAtCache = new WeakMap(), childrenCache = new WeakMap();

function readRawTerm(raw) {
  return Array.isArray(raw) ? {level: raw[0], arg: raw[1], coefficient: raw[2]} : raw;
}

function ordinalKey(ordinal) {
  const cached = ordinalKeyCache.get(ordinal);
  if (cached !== undefined) return cached;
  const key = `O(${ordinal.terms
    .map(({level, arg, coefficient}) => `T(${principalKey(level, arg)},${coefficient})`)
    .join("")})`;
  ordinalKeyCache.set(ordinal, key);
  return key;
}

function principalKey(level, arg) { return `P(${level},${ordinalKey(arg)})`; }

function comparePrincipal(a, b) {
  if (a.level !== b.level) return a.level < b.level ? -1 : 1;
  return compare(a.arg, b.arg);
}

function compare(a, b) {
  if (a === b) return 0;
  if (isZero(a)) return isZero(b) ? 0 : -1;
  if (isZero(b)) return 1;

  let index = 0;
  while (index < a.terms.length || index < b.terms.length) {
    if (index >= a.terms.length) return -1;
    if (index >= b.terms.length) return 1;

    const principalCmp = comparePrincipal(a.terms[index], b.terms[index]);
    if (principalCmp !== 0) return principalCmp;
    if (a.terms[index].coefficient !== b.terms[index].coefficient) {
      return a.terms[index].coefficient < b.terms[index].coefficient ? -1 : 1;
    }
    index += 1;
  }
  return 0;
}

function fromTerms(terms) {
  const merged = new Map();
  for (const raw of terms) {
    const {level, arg, coefficient} = readRawTerm(raw);
    if (coefficient === 0) continue;

    const key = principalKey(level, arg), existing = merged.get(key);
    if (existing === undefined) {
      merged.set(key, makeTerm(level, arg, coefficient));
      continue;
    }

    const nextCoefficient = existing.coefficient + coefficient;
    merged.set(key, makeTerm(level, existing.arg, nextCoefficient));
  }

  if (merged.size === 0) return zero;

  const normalized = Array.from(merged.values());
  normalized.sort((a, b) => comparePrincipal(b, a));
  return makeOrdinal(normalized);
}

function finite(n) {
  if (n === 0) return zero;
  return makeOrdinal([makeTerm(0, zero, n)]);
}

export function psi(level, arg, coefficient = 1) { return fromTerms([[level, arg, coefficient]]); }

const one = finite(1);

export function omegaLevel(level) { return level === 0 ? one : psi(level, zero); }

function createRawDecoder(primeIndex, rawCodeCache = null) {
  const rawOrdinalCache = new Map();

  function rawDecode(rawCode, factors = null) {
    const rawCached = rawOrdinalCache.get(rawCode);
    if (rawCached !== undefined) return rawCached;
    const rawTerms = (factors ?? primeIndex.factorize(rawCode)).map(([prime, coefficient]) => {
      let sourceIndex = primeIndex.primeIndex(prime), level = 0;
      while (sourceIndex % 2 === 0) {
        sourceIndex /= 2;
        level += 1;
      }
      return [level, rawDecode((sourceIndex + 1) / 2), coefficient];
    });
    const value = fromTerms(rawTerms);
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

    const terms = primeIndex.factorize(n).map(([prime, coefficient]) => {
      const rank = primeIndex.primeIndex(prime);
      const arg = admissibleUnrank(rank, admissibleData, rawDecode, (candidate) => isAdmissible(0, candidate));
      return [0, arg, coefficient];
    });
    const value = fromTerms(terms);
    return cacheIntegerValue(ordinalCache, n, value);
  }

  function rawCode(value) {
    const cached = rawCodeCache.get(value);
    if (cached !== undefined) return cached;

    let n = 1;
    for (const {level, arg, coefficient} of value.terms) {
      const childCode = rawCode(arg);
      if (childCode === null) {
        n = null;
        break;
      }
      const sourceIndex = (2 ** level) * (2 * childCode - 1);
      n = boundedPrimePowerProduct(n, sourceIndex, coefficient, primeIndex);
      if (n === null) break;
    }
    rawCodeCache.set(value, n);
    return n;
  }

  function natural(value) {
    const cached = naturalCache.get(value);
    if (cached !== undefined) return cached;
    if (!isLegal(value) || value.terms.some(({level}) => level !== 0)) {
      naturalCache.set(value, null);
      return null;
    }

    let n = 1;
    for (const {arg, coefficient} of value.terms) {
      const rank = admissibleRank(
        arg,
        admissibleData,
        rawCode,
        rawDecode,
        (candidate) => isAdmissible(0, candidate),
      );
      n = boundedPrimePowerProduct(n, rank, coefficient, primeIndex);
      if (n === null) break;
    }
    naturalCache.set(value, n);
    return n;
  }

  return Object.freeze({ordinal, natural});
}

function isZero(ordinal) { return ordinal.terms.length === 0; }

function isOne(ordinal) {
  return (
    ordinal.terms.length === 1 &&
    isPrincipalOne(ordinal.terms[0]) &&
    ordinal.terms[0].coefficient === 1
  );
}

function isPrincipalOne(principal) { return principal.level === 0 && isZero(principal.arg); }

function equals(a, b) { return compare(a, b) === 0; }

function withCoeffLatex(rendered, coefficient) { return coefficient === 1 ? rendered : `${rendered}${coefficient}`; }

function termToLatex({level, arg, coefficient}) {
  if (isPrincipalOne({level, arg})) return String(coefficient);
  return withCoeffLatex(principalToLatex({level, arg}), coefficient);
}

function isBelowEpsilon0(ordinal) { return ordinal.terms.every(({level, arg}) => level === 0 && isBelowEpsilon0(arg)); }

function startsAboveLevel(ordinal, level) { return ordinal.terms.length > 0 && ordinal.terms[0].level > level; }

function isEpsilonNumber(ordinal) {
  if (ordinal.terms.length !== 1) return false;
  const [term] = ordinal.terms;
  return term.coefficient === 1 && startsAboveLevel(term.arg, term.level);
}

function rawOmegaPowerLatex(exponent) {
  if (isZero(exponent)) return "1";
  if (isOne(exponent)) return "\\omega";
  return `\\omega^{${toLatex(exponent)}}`;
}

function omegaPowerLatex(exponent) { return rawOmegaPowerLatex(exponent); }

function rendered(latex, finiteNat = null) { return Object.freeze({latex, finiteNat}); }

function renderedFinite(n) { return rendered(String(n), n); }

function renderedIsZero(value) { return value.finiteNat === 0; }

function renderedIsOne(value) { return value.finiteNat === 1; }

function sumRenderedOrdinal(parts) {
  const filtered = parts.filter((part) => !renderedIsZero(part));
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
  if (finiteTotal !== 0) nonfiniteParts.push(String(finiteTotal));
  return rendered(nonfiniteParts.join("+"));
}

function onePlusRenderedOrdinal(value) { return value.finiteNat === null ? value : renderedFinite(value.finiteNat + 1); }

function basePowerLatex(baseLatex, exponent) {
  if (renderedIsZero(exponent)) return "1";
  if (exponent.finiteNat === 1) return baseLatex;
  return `${baseLatex}^{${exponent.latex}}`;
}

function baseMonomialRendered(baseLatex, exponent, omegaTail) {
  const head = basePowerLatex(baseLatex, exponent), tail = omegaPowerRendered(omegaTail);
  if (head === "1") return tail;
  if (renderedIsOne(tail)) return rendered(head);
  return rendered(`${head}${tail.latex}`);
}

function decomposeSameBaseMultiple(ordinal, baseLevel) {
  const quotientParts = [], tailTerms = [];

  for (const term of ordinal.terms) {
    if (term.level > baseLevel) return null;
    if (term.level === baseLevel) {
      const quotient = omegaPowerForSameBase(term.arg, baseLevel);
      if (quotient === null) return null;
      quotientParts.push(withRenderedCoeff(quotient, term.coefficient));
    } else {
      tailTerms.push(term);
    }
  }

  return [sumRenderedOrdinal(quotientParts), fromTerms(tailTerms)];
}

function withRenderedCoeff(value, coefficient) {
  if (value.finiteNat !== null) return renderedFinite(value.finiteNat * coefficient);
  return coefficient === 1 ? value : rendered(withCoeffLatex(value.latex, coefficient));
}

function omegaPowerRendered(exponent) {
  if (isEpsilonNumber(exponent)) return rendered(toLatex(exponent));

  if (isZero(exponent) || isBelowEpsilon0(exponent)) {
    return rendered(rawOmegaPowerLatex(exponent), isZero(exponent) ? 1 : null);
  }

  const leadingLevel = exponent.terms[0].level;
  if (leadingLevel === 0) return rendered(rawOmegaPowerLatex(exponent));

  const sameBase = omegaPowerForSameBase(exponent, leadingLevel);
  return sameBase === null ? rendered(rawOmegaPowerLatex(exponent)) : sameBase;
}

function omegaPowerForSameBase(exponent, baseLevel) {
  const decomposed = decomposeSameBaseMultiple(exponent, baseLevel);
  if (decomposed === null) return null;

  const [quotient, tail] = decomposed;
  return baseMonomialRendered(omegaLevelLatex(baseLevel), quotient, tail);
}

function omegaExprLatex(ordinal) {
  const parts = [];
  for (const term of ordinal.terms) {
    if (term.level === 0) {
      parts.push(termToLatex(term));
    } else {
      parts.push(withCoeffLatex(principalAsOmegaExprLatex(term), term.coefficient));
    }
  }
  return parts.length === 0 ? "0" : parts.join("+");
}

function principalAsOmegaExprLatex(principal) {
  if (principal.level === 0) return termToLatex({...principal, coefficient: 1});

  const sameBase = sameBasePsiAsOmegaLatex(principal.level, principal.arg);
  return sameBase === null ? principalRawLatex(principal) : sameBase;
}

function sameBasePsiAsOmegaLatex(level, arg) {
  const decomposed = decomposeSameBaseMultiple(arg, level);
  if (decomposed === null) return null;

  const [quotient, tail] = decomposed, exponent = onePlusRenderedOrdinal(quotient);
  return baseMonomialRendered(omegaLevelLatex(level), exponent, tail).latex;
}

function levelToLatex(level) { return String(level); }

function omegaLevelLatex(level) {
  if (!Number.isSafeInteger(level) || level < 1) throw new RangeError("level must be >= 1");
  return level === 1 ? "\\Omega" : `\\Omega_{${level}}`;
}

function principalToLatex(principal) {
  if (principal.level === 0) {
    if (isBelowEpsilon0(principal.arg)) return omegaPowerLatex(principal.arg);

    return `\\psi_{0}(${omegaExprLatex(principal.arg)})`;
  }

  const sameBase = sameBasePsiAsOmegaLatex(principal.level, principal.arg);
  return sameBase === null ? principalRawLatex(principal) : sameBase;
}

function principalRawLatex(principal) {
  if (isZero(principal.arg)) return omegaLevelLatex(principal.level);
  return `\\psi_{${levelToLatex(principal.level)}}(${toLatex(principal.arg)})`;
}

export function toLatex(ordinal) {
  if (isZero(ordinal)) return "0";
  return ordinal.terms.map(termToLatex).join("+");
}

export function predecessor(ordinal) {
  if (isZero(ordinal)) return null;

  const terms = ordinal.terms.slice(), lastIndex = terms.length - 1, lastTerm = terms[lastIndex];
  if (!isPrincipalOne(lastTerm)) return null;

  if (lastTerm.coefficient === 1) {
    terms.pop();
  } else {
    terms[lastIndex] = makeTerm(lastTerm.level, lastTerm.arg, lastTerm.coefficient - 1);
  }
  return terms.length === 0 ? zero : makeOrdinal(terms);
}

function isLimit(ordinal) { return !isZero(ordinal) && predecessor(ordinal) === null; }

function finiteNat(ordinal) {
  if (isZero(ordinal)) return 0;
  if (ordinal.terms.length === 1 && isPrincipalOne(ordinal.terms[0])) return ordinal.terms[0].coefficient;
  return null;
}

function splitLastUnit(ordinal) {
  if (isZero(ordinal)) return null;

  const terms = ordinal.terms.slice(), lastIndex = terms.length - 1;
  const lastTerm = terms[lastIndex], active = makeOrdinal([makeTerm(lastTerm.level, lastTerm.arg, 1)]);

  if (lastTerm.coefficient === 1) {
    terms.pop();
  } else {
    terms[lastIndex] = makeTerm(lastTerm.level, lastTerm.arg, lastTerm.coefficient - 1);
  }

  return {prefixTerms: terms, active};
}

function appendToPrefix(prefixTerms, suffix) {
  if (prefixTerms.length === 0) return suffix;
  if (isZero(suffix)) return makeOrdinal(prefixTerms);

  const prefixLast = prefixTerms[prefixTerms.length - 1], suffixFirst = suffix.terms[0];
  if (comparePrincipal(prefixLast, suffixFirst) <= 0) {
    throw new Error("fundamental-sequence suffix is not lower order than its prefix");
  }
  return makeOrdinal([...prefixTerms, ...suffix.terms]);
}

function cofinality(ordinal) {
  if (isZero(ordinal)) return Object.freeze({kind: "zero"});
  if (predecessor(ordinal) !== null) return Object.freeze({kind: "one"});

  const split = splitLastUnit(ordinal);
  if (split === null) return Object.freeze({kind: "zero"});
  if (split.prefixTerms.length !== 0 || !equals(split.active, ordinal)) return cofinality(split.active);

  const principal = ordinal.terms[0];
  if (principal.level === 0) return Object.freeze({kind: "omega"});
  if (isZero(principal.arg)) return Object.freeze({kind: "uncountable", level: principal.level});
  if (predecessor(principal.arg) !== null) return Object.freeze({kind: "omega"});

  const argCofinality = cofinality(principal.arg);
  if (argCofinality.kind === "uncountable") {
    const mu = argCofinality.level - 1;
    return mu < principal.level ? argCofinality : Object.freeze({kind: "omega"});
  }
  return Object.freeze({kind: "omega"});
}

function fsAtIndex(alpha, index) {
  if (!isLimit(alpha)) return null;

  const split = splitLastUnit(alpha);
  if (split === null) return null;
  if (split.prefixTerms.length !== 0 || !equals(split.active, alpha)) {
    const activeAt = fsAtIndex(split.active, index);
    return activeAt === null ? null : appendToPrefix(split.prefixTerms, activeAt);
  }

  const principal = alpha.terms[0], {level, arg} = principal;

  if (level > 0 && isZero(arg)) return compare(index, alpha) < 0 ? index : null;

  const argPredecessor = predecessor(arg);
  if (argPredecessor !== null) {
    const finiteIndex = finiteNat(index);
    if (finiteIndex === null) return null;
    return finiteIndex === 0 ? zero : psi(level, argPredecessor, finiteIndex);
  }

  const argCofinality = cofinality(arg);
  if (argCofinality.kind === "uncountable" && argCofinality.level - 1 >= level) {
    const finiteIndex = finiteNat(index);
    if (finiteIndex === null) return null;

    const mu = argCofinality.level - 1;
    let gamma = omegaLevel(mu), result = null;
    for (let step = 0; step <= finiteIndex; step += 1) {
      const argAtGamma = fsAtIndex(arg, gamma);
      if (argAtGamma === null) return null;
      result = psi(level, argAtGamma);
      gamma = psi(mu, argAtGamma);
    }
    return result;
  }

  const argAt = fsAtIndex(arg, index);
  return argAt === null ? null : psi(level, argAt);
}

function fsAt(alpha, n) {
  if (!isLimit(alpha)) throw new RangeError("fsAt requires a nonzero limit ordinal");

  return cachedByNumber(fsAtCache, alpha, n, () => {
    const child = fsAtIndex(alpha, finite(n));
    if (child === null) throw new Error(`fundamental sequence is undefined at finite index ${n}`);
    return child;
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

function addSupport(out, ordinal) { out.set(ordinalKey(ordinal), ordinal); }

function supportInto(level, ordinal, out) {
  for (const principal of ordinal.terms) {
    if (level <= principal.level) {
      addSupport(out, principal.arg);
      supportInto(level, principal.arg, out);
    }
  }
}

function support(level, ordinal) {
  const out = new Map();
  supportInto(level, ordinal, out);
  return Array.from(out.values()).sort(compare);
}

function isAdmissible(level, arg) { return isLegal(arg) && support(level, arg).every((guarded) => compare(guarded, arg) < 0); }

function isLegal(ordinal) { return ordinal.terms.every(({level, arg}) => isAdmissible(level, arg)); }
