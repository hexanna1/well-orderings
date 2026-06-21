const ORDINAL_KIND = "Buchholz_1Ordinal";

function freezeOrdinal(terms) {
  return Object.freeze({
    kind: ORDINAL_KIND,
    terms: Object.freeze(terms),
  });
}

export const zero = freezeOrdinal([]);

const ordinalKeyCache = new WeakMap();
const supportCache = new Map();
const admissibleCache = new Map();
const legalCache = new Map();
const usesLevelCache = new Map();
const latexCache = new WeakMap();
const fsAtCache = new Map();
const childrenCache = new Map();

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

function validateLevel(level) {
  if (level !== 0 && level !== 1) {
    throw new RangeError("level must be 0 or 1");
  }
}

function asOrdinal(value) {
  if (!value || !Array.isArray(value.terms)) {
    throw new TypeError("expected a Buchholz_1 ordinal");
  }
  return value;
}

function principal(level, arg) {
  validateLevel(level);
  return Object.freeze({ level, arg: asOrdinal(arg) });
}

function term(level, arg, coeff = 1) {
  assertPositiveInteger(coeff, "coefficient");
  return Object.freeze({
    principal: principal(level, arg),
    coeff,
  });
}

function principalKey(item) {
  return `P(${item.level},${ordinalKey(item.arg)})`;
}

function ordinalKey(ordinal) {
  const value = asOrdinal(ordinal);
  const cached = ordinalKeyCache.get(value);
  if (cached !== undefined) {
    return cached;
  }
  const key = `O(${value.terms
    .map((item) => `T(${principalKey(item.principal)},${item.coeff})`)
    .join("")})`;
  ordinalKeyCache.set(value, key);
  return key;
}

function makeOrdinal(rawTerms, checkLegal = true) {
  const grouped = new Map();

  for (const rawTerm of rawTerms) {
    if (!rawTerm || !rawTerm.principal) {
      throw new TypeError("expected ordinal term");
    }

    const { level } = rawTerm.principal;
    const arg = asOrdinal(rawTerm.principal.arg);
    const coeff = rawTerm.coeff;
    validateLevel(level);

    if (!Number.isSafeInteger(coeff) || coeff < 0) {
      throw new RangeError("coefficient must be a nonnegative safe integer");
    }
    if (coeff === 0) {
      continue;
    }

    const item = principal(level, arg);
    const key = principalKey(item);
    const previous = grouped.get(key);
    grouped.set(key, {
      principal: item,
      coeff: (previous ? previous.coeff : 0) + coeff,
    });
  }

  if (grouped.size === 0) {
    return zero;
  }

  const terms = Array.from(grouped.values())
    .sort((left, right) => comparePrincipal(right.principal, left.principal))
    .map((item) =>
      Object.freeze({
        principal: item.principal,
        coeff: item.coeff,
      }),
    );

  const ordinal = freezeOrdinal(terms);
  if (checkLegal && !isLegal(ordinal)) {
    throw new RangeError("ordinal is not in Buchholz normal form");
  }
  return ordinal;
}

function singleton(level, arg, coeff = 1) {
  return makeOrdinal([term(level, arg, coeff)]);
}

function finite(n) {
  assertNonnegativeInteger(n, "n");
  return n === 0 ? zero : singleton(0, zero, n);
}

export function psi0(arg = zero, coeff = 1) {
  return singleton(0, asOrdinal(arg), coeff);
}

export function psi1(arg = zero, coeff = 1) {
  return singleton(1, asOrdinal(arg), coeff);
}

const one = finite(1);
const omega = psi0(one);

function comparePrincipal(left, right) {
  if (left === right) {
    return 0;
  }
  if (left.level !== right.level) {
    return left.level < right.level ? -1 : 1;
  }
  return compare(left.arg, right.arg);
}

function compare(left, right) {
  const a = asOrdinal(left);
  const b = asOrdinal(right);
  if (a === b) {
    return 0;
  }

  const length = Math.max(a.terms.length, b.terms.length);
  for (let i = 0; i < length; i += 1) {
    if (i >= a.terms.length) {
      return -1;
    }
    if (i >= b.terms.length) {
      return 1;
    }

    const aTerm = a.terms[i];
    const bTerm = b.terms[i];
    const head = comparePrincipal(aTerm.principal, bTerm.principal);
    if (head !== 0) {
      return head;
    }
    if (aTerm.coeff !== bTerm.coeff) {
      return aTerm.coeff < bTerm.coeff ? -1 : 1;
    }
  }
  return 0;
}

function equals(left, right) {
  return compare(left, right) === 0;
}

function isPrincipalOne(item) {
  return item.level === 0 && isZero(item.arg);
}

function withCoeffLatex(rendered, coeff) {
  assertPositiveInteger(coeff, "coefficient");
  return coeff === 1 ? rendered : `${rendered}${coeff}`;
}

function termToLatex(item, coeff) {
  if (isPrincipalOne(item)) {
    return String(coeff);
  }
  return withCoeffLatex(principalToLatex(item), coeff);
}

function usesLevel(ordinal, level) {
  const value = asOrdinal(ordinal);
  const cacheKey = `${ordinalKey(value)}|${level}`;
  const cached = usesLevelCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = value.terms.some(
    (item) =>
      item.principal.level === level || usesLevel(item.principal.arg, level),
  );
  usesLevelCache.set(cacheKey, result);
  return result;
}

function isBelowEpsilon0(ordinal) {
  return !usesLevel(ordinal, 1);
}

function isPureAboveLevel(ordinal, level) {
  const value = asOrdinal(ordinal);
  return value.terms.length > 0 &&
    value.terms.every((item) => item.principal.level > level);
}

function isEpsilonNumber(ordinal) {
  const value = asOrdinal(ordinal);
  if (value.terms.length !== 1) {
    return false;
  }
  const [item] = value.terms;
  return item.coeff === 1 &&
    isPureAboveLevel(item.principal.arg, item.principal.level);
}

function omegaPowerLatex(exponent) {
  if (isZero(exponent)) {
    return "1";
  }
  if (equals(exponent, one)) {
    return "\\omega";
  }
  return `\\omega^{${ordinalToLatex(exponent)}}`;
}

function renderedFinite(n) {
  return Object.freeze({ latex: String(n), finiteNat: n });
}

function rendered(latex, finiteNat = null) {
  return Object.freeze({ latex, finiteNat });
}

function isRenderedZero(value) {
  return value.finiteNat === 0;
}

function sumRenderedOrdinal(parts) {
  const filtered = parts.filter((part) => !isRenderedZero(part));
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
  return rendered(nonfiniteParts.join("+"));
}

function onePlusRenderedOrdinal(value) {
  if (value.finiteNat !== null) {
    return renderedFinite(value.finiteNat + 1);
  }
  return value;
}

function omegaBasePowerLatex(exponent) {
  if (isRenderedZero(exponent)) {
    return "1";
  }
  if (exponent.finiteNat === 1) {
    return "\\Omega";
  }
  return `\\Omega^{${exponent.latex}}`;
}

function omegaTailLatex(tail) {
  if (isZero(tail)) {
    return "";
  }
  if (equals(tail, one)) {
    return "\\omega";
  }
  if (isEpsilonNumber(tail)) {
    return ordinalToLatex(tail);
  }
  return `\\omega^{${ordinalToLatex(tail)}}`;
}

function omegaBaseMonomialLatex(exponent, omegaTail) {
  const head = omegaBasePowerLatex(exponent);
  const tail = omegaTailLatex(omegaTail);
  if (head === "1") {
    return tail || "1";
  }
  return `${head}${tail}`;
}

function withRenderedCoeff(value, coeff) {
  assertPositiveInteger(coeff, "coefficient");
  if (value.finiteNat !== null) {
    return renderedFinite(value.finiteNat * coeff);
  }
  return coeff === 1 ? value : rendered(withCoeffLatex(value.latex, coeff));
}

function decomposeOmegaMultiple(ordinal) {
  const quotientParts = [];
  const tailTerms = [];

  for (const item of asOrdinal(ordinal).terms) {
    if (item.principal.level === 1) {
      quotientParts.push(
        withRenderedCoeff(omegaPowerRendered(item.principal.arg), item.coeff),
      );
    } else {
      tailTerms.push(item);
    }
  }

  return {
    quotient: sumRenderedOrdinal(quotientParts),
    tail: makeOrdinal(tailTerms),
  };
}

function omegaPowerRendered(exponent) {
  if (isEpsilonNumber(exponent)) {
    return rendered(ordinalToLatex(exponent));
  }

  const { quotient, tail } = decomposeOmegaMultiple(exponent);
  if (isRenderedZero(quotient)) {
    if (isZero(tail)) {
      return renderedFinite(1);
    }
    if (equals(tail, one)) {
      return rendered("\\omega");
    }
    return rendered(`\\omega^{${ordinalToLatex(tail)}}`);
  }

  return rendered(omegaBaseMonomialLatex(quotient, tail));
}

function omegaExprLatex(ordinal) {
  const parts = asOrdinal(ordinal).terms.map((item) => {
    if (item.principal.level === 1) {
      return withCoeffLatex(psi1AsOmegaLatex(item.principal.arg), item.coeff);
    }
    return termToLatex(item.principal, item.coeff);
  });
  return parts.length ? parts.join("+") : "0";
}

function psi1AsOmegaLatex(arg) {
  const { quotient, tail } = decomposeOmegaMultiple(arg);
  const exponent = onePlusRenderedOrdinal(quotient);
  return omegaBaseMonomialLatex(exponent, tail);
}

function principalToLatex(item) {
  if (item.level === 0) {
    if (isBelowEpsilon0(item.arg)) {
      return omegaPowerLatex(item.arg);
    }
    return `\\psi(${omegaExprLatex(item.arg)})`;
  }

  return psi1AsOmegaLatex(item.arg);
}

function ordinalToLatex(ordinal) {
  const value = asOrdinal(ordinal);
  const cached = latexCache.get(value);
  if (cached !== undefined) {
    return cached;
  }
  let result;
  if (isZero(value)) {
    result = "0";
  } else {
    result = value.terms
      .map((item) => termToLatex(item.principal, item.coeff))
      .join("+");
  }
  latexCache.set(value, result);
  return result;
}

export function toLatex(ordinal) {
  return ordinalToLatex(ordinal);
}

function isZero(ordinal) {
  return asOrdinal(ordinal).terms.length === 0;
}

function predecessorIfSuccessor(ordinal) {
  const value = asOrdinal(ordinal);
  if (isZero(value)) {
    return null;
  }

  const terms = value.terms.slice();
  const last = terms[terms.length - 1];
  if (!isPrincipalOne(last.principal)) {
    return null;
  }

  if (last.coeff === 1) {
    terms.pop();
  } else {
    terms[terms.length - 1] = term(0, zero, last.coeff - 1);
  }
  return makeOrdinal(terms);
}

export function predecessor(ordinal) {
  return predecessorIfSuccessor(ordinal);
}

function isLimit(ordinal) {
  const value = asOrdinal(ordinal);
  return !isZero(value) && predecessorIfSuccessor(value) === null;
}

function finiteNat(ordinal) {
  const value = asOrdinal(ordinal);
  if (isZero(value)) {
    return 0;
  }
  if (value.terms.length !== 1) {
    return null;
  }

  const [item] = value.terms;
  return isPrincipalOne(item.principal) ? item.coeff : null;
}

function topLevelIsCountable(ordinal) {
  return asOrdinal(ordinal).terms.every((item) => item.principal.level === 0);
}

function lastTermSplit(ordinal) {
  const value = asOrdinal(ordinal);
  if (isZero(value)) {
    return null;
  }

  const prefixTerms = value.terms.slice();
  const last = prefixTerms[prefixTerms.length - 1];
  if (last.coeff === 1) {
    prefixTerms.pop();
  } else {
    prefixTerms[prefixTerms.length - 1] = term(
      last.principal.level,
      last.principal.arg,
      last.coeff - 1,
    );
  }

  return {
    prefixTerms,
    active: makeOrdinal([term(last.principal.level, last.principal.arg, 1)]),
  };
}

function appendToPrefix(prefixTerms, suffix) {
  try {
    return isZero(suffix)
      ? makeOrdinal(prefixTerms)
      : makeOrdinal([...prefixTerms, ...asOrdinal(suffix).terms]);
  } catch {
    return null;
  }
}

function cofinalityKind(ordinal) {
  const value = asOrdinal(ordinal);
  if (isZero(value)) {
    return "zero";
  }
  if (predecessorIfSuccessor(value) !== null) {
    return "one";
  }

  const split = lastTermSplit(value);
  if (!split) {
    return "zero";
  }

  const { active } = split;
  if (active.terms.length !== 1) {
    return "omega";
  }

  const [item] = active.terms;
  const head = item.principal;
  if (head.level === 0) {
    return isZero(head.arg) ? "one" : "omega";
  }

  if (isZero(head.arg)) {
    return "uncountable";
  }
  if (predecessorIfSuccessor(head.arg) !== null) {
    return "omega";
  }
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
    if (argAtGamma === null) {
      break;
    }

    const row = termOrNull(0, argAtGamma);
    if (row === null || approximants.some((seen) => equals(seen, row))) {
      break;
    }

    approximants.push(row);
    gamma = row;
  }

  return approximants;
}

function fsAtOrdinal(ordinal, index) {
  const value = asOrdinal(ordinal);
  const eta = asOrdinal(index);
  if (!isLimit(value)) {
    return null;
  }

  const split = lastTermSplit(value);
  if (!split) {
    return null;
  }

  const { prefixTerms, active } = split;
  if (prefixTerms.length > 0 || !equals(active, value)) {
    const activeAt = fsAtOrdinal(active, eta);
    return activeAt === null ? null : appendToPrefix(prefixTerms, activeAt);
  }

  const [item] = value.terms;
  const head = item.principal;

  if (head.level === 1 && isZero(head.arg)) {
    return topLevelIsCountable(eta) ? eta : null;
  }

  const argPredecessor = predecessorIfSuccessor(head.arg);
  if (argPredecessor !== null) {
    const n = finiteNat(eta);
    if (n === null) {
      return null;
    }
    return n === 0 ? zero : termOrNull(head.level, argPredecessor, n);
  }

  if (head.level === 0 && cofinalityKind(head.arg) === "uncountable") {
    const n = finiteNat(eta);
    if (n === null) {
      return null;
    }
    const approximants = uncountableArgumentApproximants(head.arg, n + 1);
    return approximants.length === 0 ? null : approximants[approximants.length - 1];
  }

  const argAt = fsAtOrdinal(head.arg, eta);
  return argAt === null ? null : termOrNull(head.level, argAt);
}

function fsAt(alpha, n) {
  assertNonnegativeInteger(n, "n");
  const value = asOrdinal(alpha);
  if (!isLimit(value)) {
    throw new RangeError("alpha must be a nonzero limit ordinal");
  }

  const cacheKey = `${ordinalKey(value)}[${n}]`;
  const cached = fsAtCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = fsAtOrdinal(value, finite(n));
  if (result === null) {
    throw new RangeError("fundamental-sequence value is undefined here");
  }
  fsAtCache.set(cacheKey, result);
  return result;
}

export function children(alpha, buttonCount = 4) {
  assertNonnegativeInteger(buttonCount, "buttonCount");
  const value = asOrdinal(alpha);
  if (!isLimit(value)) {
    return [];
  }

  const cacheKey = `${ordinalKey(value)}|${buttonCount}`;
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

function addSupport(result, ordinal) {
  result.set(ordinalKey(ordinal), ordinal);
}

function supportPrincipal(level, item) {
  if (level > item.level) {
    return [];
  }

  const result = new Map();
  addSupport(result, item.arg);
  for (const guarded of support(level, item.arg)) {
    addSupport(result, guarded);
  }
  return Array.from(result.values());
}

function support(level, ordinal) {
  validateLevel(level);
  const value = asOrdinal(ordinal);
  const cacheKey = `${level}|${ordinalKey(value)}`;
  const cached = supportCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = new Map();
  for (const item of value.terms) {
    for (const guarded of supportPrincipal(level, item.principal)) {
      addSupport(result, guarded);
    }
  }
  const supported = Object.freeze(Array.from(result.values()));
  supportCache.set(cacheKey, supported);
  return supported;
}

function isAdmissible(level, arg) {
  validateLevel(level);
  const value = asOrdinal(arg);
  const cacheKey = `${level}|${ordinalKey(value)}`;
  const cached = admissibleCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result =
    isLegal(value) &&
    support(level, value).every((guarded) => compare(guarded, value) < 0);
  admissibleCache.set(cacheKey, result);
  return result;
}

function isLegal(ordinal) {
  const value = asOrdinal(ordinal);
  const cacheKey = ordinalKey(value);
  const cached = legalCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = value.terms.every((item) =>
    isAdmissible(item.principal.level, item.principal.arg),
  );
  legalCache.set(cacheKey, result);
  return result;
}
