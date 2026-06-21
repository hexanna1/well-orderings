function makeTerm(level, arg, coefficient) {
  return Object.freeze({ level, arg, coefficient });
}

function makeOrdinal(terms) {
  return Object.freeze({ terms: Object.freeze(terms) });
}

const zero = makeOrdinal([]);

const ordinalKeyCache = new WeakMap();
const fsAtCache = new Map();
const childrenCache = new Map();

function assertOrdinal(ordinal, name = "ordinal") {
  if (!ordinal || typeof ordinal !== "object" || !Array.isArray(ordinal.terms)) {
    throw new TypeError(`${name} must be a Buchholz ordinal`);
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

function assertLevel(value, name = "level") {
  assertNonnegativeInteger(value, name);
}

function readRawTerm(raw) {
  if (Array.isArray(raw) && raw.length === 3) {
    return { level: raw[0], arg: raw[1], coefficient: raw[2] };
  }
  if (raw && typeof raw === "object") {
    return {
      level: raw.level,
      arg: raw.arg ?? raw.argument,
      coefficient: raw.coefficient ?? raw.coeff,
    };
  }
  throw new TypeError("term must be [level, argument, coefficient] or an object term");
}

function ordinalKey(ordinal) {
  const cached = ordinalKeyCache.get(ordinal);
  if (cached !== undefined) {
    return cached;
  }
  const key = `O(${ordinal.terms
    .map(({ level, arg, coefficient }) => `T(${principalKey(level, arg)},${coefficient})`)
    .join("")})`;
  ordinalKeyCache.set(ordinal, key);
  return key;
}

function principalKey(level, arg) {
  return `P(${level},${ordinalKey(arg)})`;
}

function comparePrincipal(a, b) {
  if (a.level !== b.level) {
    return a.level < b.level ? -1 : 1;
  }
  return compare(a.arg, b.arg);
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

    const principalCmp = comparePrincipal(a.terms[index], b.terms[index]);
    if (principalCmp !== 0) {
      return principalCmp;
    }
    if (a.terms[index].coefficient !== b.terms[index].coefficient) {
      return a.terms[index].coefficient < b.terms[index].coefficient ? -1 : 1;
    }
    index += 1;
  }
  return 0;
}

function fromTerms(terms) {
  if (!terms || typeof terms[Symbol.iterator] !== "function") {
    throw new TypeError("terms must be iterable");
  }

  const merged = new Map();
  for (const raw of terms) {
    const { level, arg, coefficient } = readRawTerm(raw);
    assertLevel(level);
    assertOrdinal(arg, "term argument");
    assertNonnegativeInteger(coefficient, "term coefficient");
    if (coefficient === 0) {
      continue;
    }

    const key = principalKey(level, arg);
    const existing = merged.get(key);
    if (existing === undefined) {
      merged.set(key, makeTerm(level, arg, coefficient));
      continue;
    }

    const nextCoefficient = existing.coefficient + coefficient;
    assertPositiveInteger(nextCoefficient, "merged coefficient");
    merged.set(key, makeTerm(level, existing.arg, nextCoefficient));
  }

  if (merged.size === 0) {
    return zero;
  }

  const normalized = Array.from(merged.values());
  normalized.sort((a, b) => comparePrincipal(b, a));
  return makeOrdinal(normalized);
}

function finite(n) {
  assertNonnegativeInteger(n, "n");
  if (n === 0) {
    return zero;
  }
  return makeOrdinal([makeTerm(0, zero, n)]);
}

export function psi(level, arg, coefficient = 1) {
  assertLevel(level);
  assertOrdinal(arg, "arg");
  assertPositiveInteger(coefficient, "coefficient");
  return fromTerms([[level, arg, coefficient]]);
}

const one = finite(1);
const omega = psi(0, one);

export function omegaLevel(level) {
  assertLevel(level);
  return level === 0 ? one : psi(level, zero);
}

function isZero(ordinal) {
  assertOrdinal(ordinal);
  return ordinal.terms.length === 0;
}

function isOne(ordinal) {
  return (
    ordinal.terms.length === 1 &&
    isPrincipalOne(ordinal.terms[0]) &&
    ordinal.terms[0].coefficient === 1
  );
}

function isPrincipalOne(principal) {
  return principal.level === 0 && isZero(principal.arg);
}

function equals(a, b) {
  return compare(a, b) === 0;
}

function withCoeffLatex(rendered, coefficient) {
  assertPositiveInteger(coefficient, "coefficient");
  return coefficient === 1 ? rendered : `${rendered}${coefficient}`;
}

function termToLatex({ level, arg, coefficient }) {
  if (isPrincipalOne({ level, arg })) {
    return String(coefficient);
  }
  return withCoeffLatex(principalToLatex({ level, arg }), coefficient);
}

function isBelowEpsilon0(ordinal) {
  return ordinal.terms.every(({ level, arg }) => level === 0 && isBelowEpsilon0(arg));
}

function isPureAboveLevel(ordinal, level) {
  return ordinal.terms.length > 0 &&
    ordinal.terms.every((term) => term.level > level);
}

function isEpsilonNumber(ordinal) {
  if (ordinal.terms.length !== 1) {
    return false;
  }
  const [term] = ordinal.terms;
  return term.coefficient === 1 &&
    isPureAboveLevel(term.arg, term.level);
}

function rawOmegaPowerLatex(exponent) {
  if (isZero(exponent)) {
    return "1";
  }
  if (isOne(exponent)) {
    return "\\omega";
  }
  return `\\omega^{${toLatex(exponent)}}`;
}

function omegaPowerLatex(exponent) {
  return rawOmegaPowerLatex(exponent);
}

function rendered(latex, finiteNat = null) {
  return Object.freeze({ latex, finiteNat });
}

function renderedFinite(n) {
  assertNonnegativeInteger(n, "n");
  return rendered(String(n), n);
}

function renderedIsZero(value) {
  return value.finiteNat === 0;
}

function renderedIsOne(value) {
  return value.finiteNat === 1;
}

function sumRenderedOrdinal(parts) {
  const filtered = parts.filter((part) => !renderedIsZero(part));
  if (filtered.length === 0) {
    return renderedFinite(0);
  }

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

  if (allFinite) {
    return renderedFinite(finiteTotal);
  }
  if (finiteTotal !== 0) {
    nonfiniteParts.push(String(finiteTotal));
  }
  return rendered(nonfiniteParts.join("+"));
}

function onePlusRenderedOrdinal(value) {
  return value.finiteNat === null ? value : renderedFinite(value.finiteNat + 1);
}

function basePowerLatex(baseLatex, exponent) {
  if (renderedIsZero(exponent)) {
    return "1";
  }
  if (exponent.finiteNat === 1) {
    return baseLatex;
  }
  return `${baseLatex}^{${exponent.latex}}`;
}

function baseMonomialRendered(baseLatex, exponent, omegaTail) {
  const head = basePowerLatex(baseLatex, exponent);
  const tail = omegaPowerRendered(omegaTail);
  if (head === "1") {
    return tail;
  }
  if (renderedIsOne(tail)) {
    return rendered(head);
  }
  return rendered(`${head}${tail.latex}`);
}

function decomposeSameBaseMultiple(ordinal, baseLevel) {
  const quotientParts = [];
  const tailTerms = [];

  for (const term of ordinal.terms) {
    if (term.level > baseLevel) {
      return null;
    }
    if (term.level === baseLevel) {
      const quotient = omegaPowerForSameBase(term.arg, baseLevel);
      if (quotient === null) {
        return null;
      }
      quotientParts.push(withRenderedCoeff(quotient, term.coefficient));
    } else {
      tailTerms.push(term);
    }
  }

  return [sumRenderedOrdinal(quotientParts), fromTerms(tailTerms)];
}

function withRenderedCoeff(value, coefficient) {
  assertPositiveInteger(coefficient, "coefficient");
  if (value.finiteNat !== null) {
    return renderedFinite(value.finiteNat * coefficient);
  }
  return coefficient === 1 ? value : rendered(withCoeffLatex(value.latex, coefficient));
}

function omegaPowerRendered(exponent) {
  if (isEpsilonNumber(exponent)) {
    return rendered(toLatex(exponent));
  }

  if (isZero(exponent) || isBelowEpsilon0(exponent)) {
    return rendered(rawOmegaPowerLatex(exponent), isZero(exponent) ? 1 : null);
  }

  const leadingLevel = exponent.terms[0].level;
  if (leadingLevel === 0) {
    return rendered(rawOmegaPowerLatex(exponent));
  }

  const sameBase = omegaPowerForSameBase(exponent, leadingLevel);
  return sameBase === null ? rendered(rawOmegaPowerLatex(exponent)) : sameBase;
}

function omegaPowerForSameBase(exponent, baseLevel) {
  const decomposed = decomposeSameBaseMultiple(exponent, baseLevel);
  if (decomposed === null) {
    return null;
  }

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
  if (principal.level === 0) {
    return termToLatex({ ...principal, coefficient: 1 });
  }

  const sameBase = sameBasePsiAsOmegaLatex(principal.level, principal.arg);
  return sameBase === null ? principalRawLatex(principal) : sameBase;
}

function sameBasePsiAsOmegaLatex(level, arg) {
  const decomposed = decomposeSameBaseMultiple(arg, level);
  if (decomposed === null) {
    return null;
  }

  const [quotient, tail] = decomposed;
  const exponent = onePlusRenderedOrdinal(quotient);
  return baseMonomialRendered(omegaLevelLatex(level), exponent, tail).latex;
}

function levelToLatex(level) {
  assertLevel(level);
  return String(level);
}

function omegaLevelLatex(level) {
  if (!Number.isSafeInteger(level) || level < 1) {
    throw new RangeError("level must be >= 1");
  }
  return level === 1 ? "\\Omega" : `\\Omega_{${level}}`;
}

function principalToLatex(principal) {
  if (principal.level === 0) {
    if (isBelowEpsilon0(principal.arg)) {
      return omegaPowerLatex(principal.arg);
    }

    return `\\psi_{0}(${omegaExprLatex(principal.arg)})`;
  }

  const sameBase = sameBasePsiAsOmegaLatex(principal.level, principal.arg);
  return sameBase === null ? principalRawLatex(principal) : sameBase;
}

function principalRawLatex(principal) {
  if (isZero(principal.arg)) {
    return omegaLevelLatex(principal.level);
  }
  return `\\psi_{${levelToLatex(principal.level)}}(${toLatex(principal.arg)})`;
}

export function toLatex(ordinal) {
  assertOrdinal(ordinal);
  if (isZero(ordinal)) {
    return "0";
  }
  return ordinal.terms.map(termToLatex).join("+");
}

export function predecessor(ordinal) {
  assertOrdinal(ordinal);
  if (isZero(ordinal)) {
    return null;
  }

  const terms = ordinal.terms.slice();
  const lastIndex = terms.length - 1;
  const lastTerm = terms[lastIndex];
  if (!isPrincipalOne(lastTerm)) {
    return null;
  }

  if (lastTerm.coefficient === 1) {
    terms.pop();
  } else {
    terms[lastIndex] = makeTerm(lastTerm.level, lastTerm.arg, lastTerm.coefficient - 1);
  }
  return terms.length === 0 ? zero : makeOrdinal(terms);
}

function isLimit(ordinal) {
  assertOrdinal(ordinal);
  return !isZero(ordinal) && predecessor(ordinal) === null;
}

function finiteNat(ordinal) {
  assertOrdinal(ordinal);
  if (isZero(ordinal)) {
    return 0;
  }
  if (ordinal.terms.length === 1 && isPrincipalOne(ordinal.terms[0])) {
    return ordinal.terms[0].coefficient;
  }
  return null;
}

function splitLastUnit(ordinal) {
  if (isZero(ordinal)) {
    return null;
  }

  const terms = ordinal.terms.slice();
  const lastIndex = terms.length - 1;
  const lastTerm = terms[lastIndex];
  const active = makeOrdinal([makeTerm(lastTerm.level, lastTerm.arg, 1)]);

  if (lastTerm.coefficient === 1) {
    terms.pop();
  } else {
    terms[lastIndex] = makeTerm(lastTerm.level, lastTerm.arg, lastTerm.coefficient - 1);
  }

  return { prefixTerms: terms, active };
}

function appendToPrefix(prefixTerms, suffix) {
  if (prefixTerms.length === 0) {
    return suffix;
  }
  if (isZero(suffix)) {
    return makeOrdinal(prefixTerms);
  }

  const prefixLast = prefixTerms[prefixTerms.length - 1];
  const suffixFirst = suffix.terms[0];
  if (comparePrincipal(prefixLast, suffixFirst) <= 0) {
    throw new Error("fundamental-sequence suffix is not lower order than its prefix");
  }
  return makeOrdinal([...prefixTerms, ...suffix.terms]);
}

function cofinality(ordinal) {
  if (isZero(ordinal)) {
    return Object.freeze({ kind: "zero" });
  }
  if (predecessor(ordinal) !== null) {
    return Object.freeze({ kind: "one" });
  }

  const split = splitLastUnit(ordinal);
  if (split === null) {
    return Object.freeze({ kind: "zero" });
  }
  if (split.prefixTerms.length !== 0 || !equals(split.active, ordinal)) {
    return cofinality(split.active);
  }

  const principal = ordinal.terms[0];
  if (principal.level === 0) {
    return Object.freeze({ kind: "omega" });
  }
  if (isZero(principal.arg)) {
    return Object.freeze({ kind: "uncountable", level: principal.level });
  }
  if (predecessor(principal.arg) !== null) {
    return Object.freeze({ kind: "omega" });
  }

  const argCofinality = cofinality(principal.arg);
  if (argCofinality.kind === "uncountable") {
    const mu = argCofinality.level - 1;
    return mu < principal.level ? argCofinality : Object.freeze({ kind: "omega" });
  }
  return Object.freeze({ kind: "omega" });
}

function fsAtIndex(alpha, index) {
  if (!isLimit(alpha)) {
    return null;
  }

  const split = splitLastUnit(alpha);
  if (split === null) {
    return null;
  }
  if (split.prefixTerms.length !== 0 || !equals(split.active, alpha)) {
    const activeAt = fsAtIndex(split.active, index);
    return activeAt === null ? null : appendToPrefix(split.prefixTerms, activeAt);
  }

  const principal = alpha.terms[0];
  const { level, arg } = principal;

  if (level > 0 && isZero(arg)) {
    return compare(index, alpha) < 0 ? index : null;
  }

  const argPredecessor = predecessor(arg);
  if (argPredecessor !== null) {
    const finiteIndex = finiteNat(index);
    if (finiteIndex === null) {
      return null;
    }
    return finiteIndex === 0 ? zero : psi(level, argPredecessor, finiteIndex);
  }

  const argCofinality = cofinality(arg);
  if (argCofinality.kind === "uncountable" && argCofinality.level - 1 >= level) {
    const finiteIndex = finiteNat(index);
    if (finiteIndex === null) {
      return null;
    }

    const mu = argCofinality.level - 1;
    let gamma = omegaLevel(mu);
    let result = null;
    for (let step = 0; step <= finiteIndex; step += 1) {
      const argAtGamma = fsAtIndex(arg, gamma);
      if (argAtGamma === null) {
        return null;
      }
      result = psi(level, argAtGamma);
      gamma = psi(mu, argAtGamma);
    }
    return result;
  }

  const argAt = fsAtIndex(arg, index);
  return argAt === null ? null : psi(level, argAt);
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

  const child = fsAtIndex(alpha, finite(n));
  if (child === null) {
    throw new Error(`fundamental sequence is undefined at finite index ${n}`);
  }
  fsAtCache.set(cacheKey, child);
  return child;
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

function addSupport(out, ordinal) {
  out.set(ordinalKey(ordinal), ordinal);
}

function supportInto(level, ordinal, out) {
  for (const principal of ordinal.terms) {
    if (level <= principal.level) {
      addSupport(out, principal.arg);
      supportInto(level, principal.arg, out);
    }
  }
}

function support(level, ordinal) {
  assertLevel(level);
  assertOrdinal(ordinal);
  const out = new Map();
  supportInto(level, ordinal, out);
  return Array.from(out.values()).sort(compare);
}

function isAdmissible(level, arg) {
  assertLevel(level);
  assertOrdinal(arg, "arg");
  return isLegal(arg) && support(level, arg).every((guarded) => compare(guarded, arg) < 0);
}

function isLegal(ordinal) {
  assertOrdinal(ordinal);
  return ordinal.terms.every(({ level, arg }) => isAdmissible(level, arg));
}
