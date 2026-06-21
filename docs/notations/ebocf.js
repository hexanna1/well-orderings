const finiteCache = new Map();
const legalCache = new Map();
const admissibleCache = new Map();
const supportCache = new Map();
const belowEpsilon0Cache = new Map();
const usesLevelCache = new Map();
const ordinalKeyCache = new WeakMap();
const fsAtCache = new Map();
const childrenCache = new Map();

function assertOrdinal(value, name = "ordinal") {
  if (!value || !Array.isArray(value.terms)) {
    throw new TypeError(`${name} must be an EBOCF ordinal`);
  }
}

function assertNat(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a nonnegative safe integer`);
  }
}

function freezeOrdinal(terms) {
  return Object.freeze({
    terms: Object.freeze(
      terms.map((term) =>
        Object.freeze({
          level: term.level,
          arg: term.arg,
          coeff: term.coeff,
        }),
      ),
    ),
  });
}

function makeOrdinal(terms, { checkLegal = false } = {}) {
  const normalized = normalizeTerms(terms);
  const ordinal = freezeOrdinal(normalized);
  if (checkLegal && !isLegal(ordinal)) {
    throw new RangeError("ordinal is not in EBOCF normal form");
  }
  return ordinal;
}

function normalizeTerms(terms) {
  const merged = [];
  for (const term of terms) {
    assertOrdinal(term.level, "term level");
    assertOrdinal(term.arg, "term argument");
    assertNat(term.coeff, "term coefficient");
    if (term.coeff === 0) {
      continue;
    }

    const existing = merged.find((candidate) => samePrincipal(candidate, term));
    if (existing) {
      existing.coeff = addCoefficients(existing.coeff, term.coeff);
    } else {
      merged.push({ level: term.level, arg: term.arg, coeff: term.coeff });
    }
  }

  merged.sort((a, b) => comparePrincipal(b, a));
  return merged;
}

function addCoefficients(left, right) {
  const total = left + right;
  if (!Number.isSafeInteger(total)) {
    throw new RangeError("coefficient sum exceeds the safe integer range");
  }
  return total;
}

function ordinalKey(ordinal) {
  assertOrdinal(ordinal);
  const cached = ordinalKeyCache.get(ordinal);
  if (cached !== undefined) {
    return cached;
  }
  const key = `O(${ordinal.terms
    .map(
      (term) =>
        `T(P(${ordinalKey(term.level)},${ordinalKey(term.arg)}),${term.coeff})`,
    )
    .join("")})`;
  ordinalKeyCache.set(ordinal, key);
  return key;
}

function sameOrdinal(a, b) {
  return compare(a, b) === 0;
}

function samePrincipal(a, b) {
  return comparePrincipal(a, b) === 0;
}

function comparePrincipal(a, b) {
  const levelCmp = compare(a.level, b.level);
  if (levelCmp !== 0) {
    return levelCmp;
  }
  return compare(a.arg, b.arg);
}

export const zero = freezeOrdinal([]);
finiteCache.set(0, zero);

function finite(n) {
  assertNat(n, "n");
  const cached = finiteCache.get(n);
  if (cached) {
    return cached;
  }
  const value = makeOrdinal([{ level: zero, arg: zero, coeff: n }]);
  finiteCache.set(n, value);
  return value;
}

export function psi(level, arg, coeff = 1) {
  assertOrdinal(level, "level");
  assertOrdinal(arg, "argument");
  if (!Number.isSafeInteger(coeff) || coeff < 1) {
    throw new RangeError("coefficient must be a positive safe integer");
  }
  return makeOrdinal([{ level, arg, coeff }], { checkLegal: true });
}

function sum(...ordinals) {
  return makeOrdinal(
    ordinals.flatMap((ordinal) => {
      assertOrdinal(ordinal);
      return ordinal.terms;
    }),
    { checkLegal: true },
  );
}

const one = finite(1);

function compare(a, b) {
  assertOrdinal(a, "left ordinal");
  assertOrdinal(b, "right ordinal");
  if (a === b) {
    return 0;
  }
  if (a.terms.length === 0) {
    return b.terms.length === 0 ? 0 : -1;
  }
  if (b.terms.length === 0) {
    return 1;
  }

  const max = Math.max(a.terms.length, b.terms.length);
  for (let i = 0; i < max; i += 1) {
    if (i >= a.terms.length) {
      return -1;
    }
    if (i >= b.terms.length) {
      return 1;
    }

    const aTerm = a.terms[i];
    const bTerm = b.terms[i];
    const principalCmp = comparePrincipal(aTerm, bTerm);
    if (principalCmp !== 0) {
      return principalCmp;
    }
    if (aTerm.coeff !== bTerm.coeff) {
      return aTerm.coeff < bTerm.coeff ? -1 : 1;
    }
  }
  return 0;
}

function isZero(ordinal) {
  assertOrdinal(ordinal);
  return ordinal.terms.length === 0;
}

function isPrincipalOne(term) {
  return isZero(term.level) && isZero(term.arg);
}

function asFiniteNat(ordinal) {
  assertOrdinal(ordinal);
  if (isZero(ordinal)) {
    return 0;
  }
  if (ordinal.terms.length !== 1) {
    return null;
  }
  const term = ordinal.terms[0];
  return isPrincipalOne(term) ? term.coeff : null;
}

export function predecessor(ordinal) {
  assertOrdinal(ordinal);
  if (isZero(ordinal)) {
    return null;
  }

  const terms = ordinal.terms.slice();
  const last = terms[terms.length - 1];
  if (!isPrincipalOne(last)) {
    return null;
  }

  if (last.coeff === 1) {
    terms.pop();
  } else {
    terms[terms.length - 1] = {
      level: last.level,
      arg: last.arg,
      coeff: last.coeff - 1,
    };
  }
  return terms.length === 0 ? zero : makeOrdinal(terms, { checkLegal: true });
}

function isLimit(ordinal) {
  assertOrdinal(ordinal);
  return !isZero(ordinal) && predecessor(ordinal) === null;
}

function support(level, ordinal) {
  const cacheKey = `${ordinalKey(level)}||${ordinalKey(ordinal)}`;
  const cached = supportCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const seen = new Map();
  for (const term of ordinal.terms) {
    for (const item of supportPrincipal(level, term)) {
      seen.set(ordinalKey(item), item);
    }
  }
  const result = Object.freeze([...seen.values()]);
  supportCache.set(cacheKey, result);
  return result;
}

function supportPrincipal(level, term) {
  if (compare(term.level, level) < 0) {
    return [];
  }

  const seen = new Map();
  seen.set(ordinalKey(term.arg), term.arg);
  for (const item of support(level, term.level)) {
    seen.set(ordinalKey(item), item);
  }
  for (const item of support(level, term.arg)) {
    seen.set(ordinalKey(item), item);
  }
  return [...seen.values()];
}

function isAdmissible(level, arg) {
  assertOrdinal(level, "level");
  assertOrdinal(arg, "argument");
  const cacheKey = `${ordinalKey(level)}||${ordinalKey(arg)}`;
  const cached = admissibleCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const result =
    isLegal(level) &&
    isLegal(arg) &&
    support(level, arg).every((guarded) => compare(guarded, arg) < 0);
  admissibleCache.set(cacheKey, result);
  return result;
}

function isLegalPrincipal(term) {
  return isLegal(term.level) && isAdmissible(term.level, term.arg);
}

function isLegal(ordinal) {
  assertOrdinal(ordinal);
  const cacheKey = ordinalKey(ordinal);
  const cached = legalCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const result = ordinal.terms.every((term) => isLegalPrincipal(term));
  legalCache.set(cacheKey, result);
  return result;
}

function usesLevelAtLeast(ordinal, threshold) {
  const cacheKey = `${ordinalKey(ordinal)}||${ordinalKey(threshold)}`;
  const cached = usesLevelCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const result = ordinal.terms.some(
    (term) =>
      compare(term.level, threshold) >= 0 ||
      usesLevelAtLeast(term.level, threshold) ||
      usesLevelAtLeast(term.arg, threshold),
  );
  usesLevelCache.set(cacheKey, result);
  return result;
}

function isBelowEpsilon0(ordinal) {
  const cacheKey = ordinalKey(ordinal);
  const cached = belowEpsilon0Cache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = !usesLevelAtLeast(ordinal, one);
  belowEpsilon0Cache.set(cacheKey, result);
  return result;
}

function isPureAboveLevel(ordinal, level) {
  return ordinal.terms.length > 0 &&
    ordinal.terms.every((term) => compare(term.level, level) > 0);
}

function isEpsilonNumber(ordinal) {
  if (ordinal.terms.length !== 1) {
    return false;
  }
  const [term] = ordinal.terms;
  return term.coeff === 1 &&
    isPureAboveLevel(term.arg, term.level);
}

function withCoeffLatex(rendered, coeff) {
  if (coeff < 1) {
    throw new RangeError("coefficient must be positive");
  }
  return coeff === 1 ? rendered : `${rendered}${coeff}`;
}

function termToLatex(term) {
  if (isPrincipalOne(term)) {
    return String(term.coeff);
  }
  return withCoeffLatex(principalToLatex(term), term.coeff);
}

function principalToLatex(term) {
  if (isZero(term.level)) {
    if (isBelowEpsilon0(term.arg)) {
      return omegaPowerLatex(term.arg);
    }
    return `\\psi_{0}(${omegaExprLatex(term.arg)})`;
  }

  const rendered = sameBasePsiAsOmegaLatex(term.level, term.arg);
  if (rendered !== null) {
    return rendered;
  }
  return principalRawLatex(term);
}

function levelToLatex(level) {
  const finite = asFiniteNat(level);
  return finite === null ? toLatex(level) : String(finite);
}

function omegaLevelLatex(level) {
  const finite = asFiniteNat(level);
  if (finite === 0) {
    return "1";
  }
  if (finite === 1) {
    return "\\Omega";
  }
  if (finite !== null) {
    return `\\Omega_{${finite}}`;
  }
  return `\\Omega_{${toLatex(level)}}`;
}

function omegaPowerLatex(exponent) {
  if (isZero(exponent)) {
    return "1";
  }
  if (sameOrdinal(exponent, one)) {
    return "\\omega";
  }
  return `\\omega^{${toLatex(exponent)}}`;
}

function renderedFinite(n) {
  return { latex: String(n), finiteNat: n };
}

function renderedIsZero(rendered) {
  return rendered.finiteNat === 0;
}

function renderedIsOne(rendered) {
  return rendered.finiteNat === 1;
}

function sumRendered(parts) {
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
  if (finiteTotal) {
    nonfiniteParts.push(String(finiteTotal));
  }
  return { latex: nonfiniteParts.join("+"), finiteNat: null };
}

function withRenderedCoeff(rendered, coeff) {
  if (rendered.finiteNat !== null) {
    return renderedFinite(rendered.finiteNat * coeff);
  }
  return coeff === 1
    ? rendered
    : { latex: withCoeffLatex(rendered.latex, coeff), finiteNat: null };
}

function onePlusRendered(rendered) {
  if (rendered.finiteNat !== null) {
    return renderedFinite(rendered.finiteNat + 1);
  }
  return rendered;
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
    return { latex: head, finiteNat: null };
  }
  return { latex: `${head}${tail.latex}`, finiteNat: null };
}

function decomposeSameBaseMultiple(ordinal, baseLevel) {
  const quotientParts = [];
  const tailTerms = [];

  for (const term of ordinal.terms) {
    const levelCmp = compare(term.level, baseLevel);
    if (levelCmp > 0) {
      return null;
    }
    if (levelCmp === 0) {
      const quotient = omegaPowerForSameBase(term.arg, baseLevel);
      if (quotient === null) {
        return null;
      }
      quotientParts.push(withRenderedCoeff(quotient, term.coeff));
    } else {
      tailTerms.push(term);
    }
  }

  return {
    quotient: sumRendered(quotientParts),
    tail: makeOrdinal(tailTerms),
  };
}

function omegaPowerForSameBase(exponent, baseLevel) {
  const decomposed = decomposeSameBaseMultiple(exponent, baseLevel);
  if (decomposed === null) {
    return null;
  }
  return baseMonomialRendered(
    omegaLevelLatex(baseLevel),
    decomposed.quotient,
    decomposed.tail,
  );
}

function omegaPowerRendered(exponent) {
  if (isEpsilonNumber(exponent)) {
    return { latex: toLatex(exponent), finiteNat: null };
  }

  if (isZero(exponent) || isBelowEpsilon0(exponent)) {
    return {
      latex: omegaPowerLatex(exponent),
      finiteNat: isZero(exponent) ? 1 : null,
    };
  }

  const leadingLevel = exponent.terms[0].level;
  if (isZero(leadingLevel)) {
    return { latex: omegaPowerLatex(exponent), finiteNat: null };
  }

  const rendered = omegaPowerForSameBase(exponent, leadingLevel);
  return rendered ?? { latex: omegaPowerLatex(exponent), finiteNat: null };
}

function omegaExprLatex(ordinal) {
  const parts = ordinal.terms.map((term) => {
    if (isZero(term.level)) {
      return termToLatex(term);
    }
    return withCoeffLatex(principalAsOmegaExprLatex(term), term.coeff);
  });
  return parts.length === 0 ? "0" : parts.join("+");
}

function principalAsOmegaExprLatex(term) {
  if (isZero(term.level)) {
    return termToLatex({ level: term.level, arg: term.arg, coeff: 1 });
  }
  const rendered = sameBasePsiAsOmegaLatex(term.level, term.arg);
  return rendered ?? principalRawLatex(term);
}

function sameBasePsiAsOmegaLatex(level, arg) {
  if (isZero(level)) {
    return null;
  }

  const decomposed = decomposeSameBaseMultiple(arg, level);
  if (decomposed === null) {
    return null;
  }

  const exponent = onePlusRendered(decomposed.quotient);
  return baseMonomialRendered(
    omegaLevelLatex(level),
    exponent,
    decomposed.tail,
  ).latex;
}

function principalRawLatex(term) {
  if (isZero(term.arg)) {
    return omegaLevelLatex(term.level);
  }
  return `\\psi_{${levelToLatex(term.level)}}(${toLatex(term.arg)})`;
}

export function toLatex(ordinal) {
  assertOrdinal(ordinal);
  if (isZero(ordinal)) {
    return "0";
  }
  return ordinal.terms.map((term) => termToLatex(term)).join("+");
}

function lastTermSplit(ordinal) {
  if (isZero(ordinal)) {
    return null;
  }

  const terms = ordinal.terms.slice();
  const last = terms[terms.length - 1];
  if (last.coeff === 1) {
    terms.pop();
  } else {
    terms[terms.length - 1] = {
      level: last.level,
      arg: last.arg,
      coeff: last.coeff - 1,
    };
  }

  const active = makeOrdinal([
    { level: last.level, arg: last.arg, coeff: 1 },
  ]);
  return { prefixTerms: terms, active };
}

function appendToPrefix(prefixTerms, suffix) {
  if (isZero(suffix)) {
    return prefixTerms.length === 0
      ? zero
      : makeOrdinal(prefixTerms, { checkLegal: true });
  }
  return makeOrdinal([...prefixTerms, ...suffix.terms], { checkLegal: true });
}

function cofinalityKind(ordinal) {
  if (isZero(ordinal)) {
    return { kind: "zero" };
  }
  if (predecessor(ordinal) !== null) {
    return { kind: "one" };
  }

  const split = lastTermSplit(ordinal);
  if (!split) {
    return { kind: "zero" };
  }
  if (split.prefixTerms.length > 0 || !sameOrdinal(split.active, ordinal)) {
    return cofinalityKind(split.active);
  }

  const term = ordinal.terms[0];
  if (isZero(term.level)) {
    return isZero(term.arg) ? { kind: "one" } : { kind: "omega" };
  }

  if (isZero(term.arg)) {
    if (predecessor(term.level) !== null) {
      return { kind: "uncountable", level: term.level };
    }
    return cofinalityKind(term.level);
  }

  if (predecessor(term.arg) !== null) {
    return { kind: "omega" };
  }

  const argCofinality = cofinalityKind(term.arg);
  if (
    argCofinality.kind === "uncountable" &&
    compare(argCofinality.level, term.level) > 0
  ) {
    return { kind: "omega" };
  }
  return argCofinality;
}

function requireFiniteIndex(index, context) {
  const finite = asFiniteNat(index);
  if (finite === null) {
    throw new RangeError(`${context} requires a finite natural index`);
  }
  return finite;
}

function fsAtIndex(alpha, index) {
  assertOrdinal(alpha, "alpha");
  assertOrdinal(index, "index");
  if (!isLimit(alpha)) {
    throw new RangeError("fundamental sequences are only defined here for limit ordinals");
  }

  const split = lastTermSplit(alpha);
  if (!split) {
    throw new RangeError("zero has no fundamental sequence");
  }
  if (split.prefixTerms.length > 0 || !sameOrdinal(split.active, alpha)) {
    const activeAt = fsAtIndex(split.active, index);
    return appendToPrefix(split.prefixTerms, activeAt);
  }

  const term = alpha.terms[0];

  if (isZero(term.arg)) {
    if (isZero(term.level)) {
      throw new RangeError("1 is not a limit ordinal");
    }
    if (isLimit(term.level)) {
      return psi(fsAtIndex(term.level, index), zero);
    }
    if (compare(index, alpha) >= 0) {
      throw new RangeError("index is outside this regular Omega level");
    }
    return index;
  }

  const argPredecessor = predecessor(term.arg);
  if (argPredecessor !== null) {
    const finiteIndex = requireFiniteIndex(
      index,
      "successor-argument fundamental sequence",
    );
    return finiteIndex === 0
      ? zero
      : psi(term.level, argPredecessor, finiteIndex);
  }

  const argCofinality = cofinalityKind(term.arg);
  if (argCofinality.kind === "omega") {
    return psi(term.level, fsAtIndex(term.arg, index));
  }

  if (argCofinality.kind === "uncountable") {
    if (compare(argCofinality.level, term.level) <= 0) {
      return psi(term.level, fsAtIndex(term.arg, index));
    }

    const finiteIndex = requireFiniteIndex(
      index,
      "diagonal fundamental sequence",
    );
    const mu = predecessor(argCofinality.level);
    if (mu === null) {
      throw new RangeError("unsupported non-successor uncountable cofinality");
    }

    let gamma = psi(mu, zero);
    let result = null;
    for (let i = 0; i <= finiteIndex; i += 1) {
      const argAtGamma = fsAtIndex(term.arg, gamma);
      result = psi(term.level, argAtGamma);
      gamma = psi(mu, argAtGamma);
    }
    return result;
  }

  throw new RangeError("unsupported cofinality for EBOCF fundamental sequence");
}

function fsAt(alpha, n) {
  assertNat(n, "n");
  if (!isLimit(alpha)) {
    throw new RangeError("alpha must be a limit ordinal");
  }
  const cacheKey = `${ordinalKey(alpha)}[${n}]`;
  const cached = fsAtCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = fsAtIndex(alpha, finite(n));
  fsAtCache.set(cacheKey, result);
  return result;
}

export function children(alpha, buttonCount = 4) {
  assertNat(buttonCount, "buttonCount");
  if (!isLimit(alpha)) {
    return [];
  }
  const cacheKey = `${ordinalKey(alpha)}|${buttonCount}`;
  const cached = childrenCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = Array.from({ length: buttonCount }, (_, n) => fsAt(alpha, n));
  const frozen = Object.freeze(result);
  childrenCache.set(cacheKey, frozen);
  return frozen;
}
