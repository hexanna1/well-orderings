const ORDINAL_KIND = "binary-veblen-ordinal";
const PHI_KIND = "binary-veblen-phi";

function uncheckedOrdinal(terms) {
  return Object.freeze({
    kind: ORDINAL_KIND,
    terms: Object.freeze(terms),
  });
}

function uncheckedPhi(beta, gamma) {
  return Object.freeze({
    kind: PHI_KIND,
    beta,
    gamma,
  });
}

function uncheckedTerm(phiTerm, coefficient) {
  return Object.freeze({
    phi: phiTerm,
    coefficient,
  });
}

export const zero = uncheckedOrdinal([]);
const PHI_ONE = uncheckedPhi(zero, zero);
const one = uncheckedOrdinal([uncheckedTerm(PHI_ONE, 1)]);

const ordinalKeyCache = new WeakMap();
const phiKeyCache = new WeakMap();
const fsAtCache = new Map();
const childrenCache = new Map();

function keyOfPhi(phiTerm) {
  const cached = phiKeyCache.get(phiTerm);
  if (cached !== undefined) {
    return cached;
  }
  const key = `P(${keyOfOrdinal(phiTerm.beta)},${keyOfOrdinal(phiTerm.gamma)})`;
  phiKeyCache.set(phiTerm, key);
  return key;
}

function keyOfOrdinal(ordinal) {
  const cached = ordinalKeyCache.get(ordinal);
  if (cached !== undefined) {
    return cached;
  }
  const key = `O(${ordinal.terms
    .map(({ phi, coefficient }) => `T(${keyOfPhi(phi)},${coefficient})`)
    .join("")})`;
  ordinalKeyCache.set(ordinal, key);
  return key;
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

function assertSafeProduct(a, b, name) {
  const product = a * b;
  if (!Number.isSafeInteger(product)) {
    throw new RangeError(`${name} exceeds JavaScript's safe integer range`);
  }
  return product;
}

function isOrdinalObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    value.kind === ORDINAL_KIND &&
    Array.isArray(value.terms)
  );
}

function asOrdinal(value) {
  if (isOrdinalObject(value)) {
    return value;
  }
  if (value !== null && typeof value === "object" && Array.isArray(value.terms)) {
    return fromTerms(value.terms);
  }
  throw new TypeError("expected a Binary Veblen ordinal");
}

function parsePhi(value) {
  if (value !== null && typeof value === "object") {
    if ("beta" in value && "gamma" in value) {
      return {
        beta: asOrdinal(value.beta),
        gamma: asOrdinal(value.gamma),
      };
    }
    if (Array.isArray(value) && value.length === 2) {
      return {
        beta: asOrdinal(value[0]),
        gamma: asOrdinal(value[1]),
      };
    }
  }
  throw new TypeError("expected a Binary Veblen phi term");
}

function parseTerm(value) {
  if (Array.isArray(value)) {
    if (value.length === 2) {
      const parsedPhi = parsePhi(value[0]);
      return {
        phi: uncheckedPhi(parsedPhi.beta, parsedPhi.gamma),
        coefficient: value[1],
      };
    }
    if (value.length === 3) {
      return {
        phi: uncheckedPhi(asOrdinal(value[0]), asOrdinal(value[1])),
        coefficient: value[2],
      };
    }
  }

  if (value !== null && typeof value === "object") {
    const coefficient = value.coefficient ?? value.coeff ?? 1;
    if ("phi" in value) {
      const parsedPhi = parsePhi(value.phi);
      return {
        phi: uncheckedPhi(parsedPhi.beta, parsedPhi.gamma),
        coefficient,
      };
    }
    if ("beta" in value && "gamma" in value) {
      return {
        phi: uncheckedPhi(asOrdinal(value.beta), asOrdinal(value.gamma)),
        coefficient,
      };
    }
  }

  throw new TypeError("expected a Binary Veblen normal-form term");
}

function makePhi(beta = zero, gamma = zero) {
  return uncheckedPhi(asOrdinal(beta), asOrdinal(gamma));
}

function term(beta = zero, gamma = zero, coefficient = 1) {
  assertSafePositiveInteger(coefficient, "coefficient");
  return uncheckedTerm(makePhi(beta, gamma), coefficient);
}

function fromTerms(terms = []) {
  const normalized = [];
  for (const rawTerm of terms) {
    const parsed = parseTerm(rawTerm);
    assertSafePositiveInteger(parsed.coefficient, "coefficient");
    const phiTerm = makePhi(parsed.phi.beta, parsed.phi.gamma);
    if (isFixedPointArgument(phiTerm.beta, phiTerm.gamma)) {
      throw new RangeError("ordinal is not in Veblen normal form: fixed-point argument");
    }
    normalized.push(uncheckedTerm(phiTerm, parsed.coefficient));
  }

  if (normalized.length === 0) {
    return zero;
  }

  normalized.sort((a, b) => -cmpPhi(a.phi, b.phi));

  const merged = [];
  for (const item of normalized) {
    const previous = merged[merged.length - 1];
    if (previous && cmpPhi(previous.phi, item.phi) === 0) {
      const coefficient = assertSafeProduct(1, previous.coefficient + item.coefficient, "coefficient");
      merged[merged.length - 1] = uncheckedTerm(previous.phi, coefficient);
    } else {
      merged.push(item);
    }
  }

  return uncheckedOrdinal(merged);
}

function principal(beta = zero, gamma = zero, coefficient = 1) {
  return fromTerms([term(beta, gamma, coefficient)]);
}

export function phi(beta = zero, gamma = zero, coefficient = 1) {
  assertSafePositiveInteger(coefficient, "coefficient");
  return multiplyPrincipalValue(phiValue(beta, gamma), coefficient);
}

const omega = phi(zero, one);
function isZero(ordinal) {
  return asOrdinal(ordinal).terms.length === 0;
}

function isPhiOne(phiTerm) {
  return isZero(phiTerm.beta) && isZero(phiTerm.gamma);
}

function asFiniteNat(ordinal) {
  const value = asOrdinal(ordinal);
  if (isZero(value)) {
    return 0;
  }
  if (value.terms.length !== 1) {
    return null;
  }
  const only = value.terms[0];
  return isPhiOne(only.phi) ? only.coefficient : null;
}

function isOne(ordinal) {
  return asFiniteNat(ordinal) === 1;
}

function ordinalFromPhi(phiTerm) {
  return uncheckedOrdinal([uncheckedTerm(phiTerm, 1)]);
}

function cmpPhi(a, b) {
  if (a === b) {
    return 0;
  }

  const betaCmp = cmpOrdinal(a.beta, b.beta);
  if (betaCmp === 0) {
    return cmpOrdinal(a.gamma, b.gamma);
  }

  if (betaCmp < 0) {
    return cmpOrdinal(a.gamma, ordinalFromPhi(b));
  }

  return cmpOrdinal(ordinalFromPhi(a), b.gamma);
}

function cmpOrdinal(a, b) {
  const left = asOrdinal(a);
  const right = asOrdinal(b);
  if (left === right) {
    return 0;
  }
  if (isZero(left)) {
    return isZero(right) ? 0 : -1;
  }
  if (isZero(right)) {
    return 1;
  }

  let i = 0;
  while (true) {
    if (i >= left.terms.length && i >= right.terms.length) {
      return 0;
    }
    if (i >= left.terms.length) {
      return -1;
    }
    if (i >= right.terms.length) {
      return 1;
    }

    const leftTerm = left.terms[i];
    const rightTerm = right.terms[i];
    const headCmp = cmpPhi(leftTerm.phi, rightTerm.phi);
    if (headCmp !== 0) {
      return headCmp < 0 ? -1 : 1;
    }
    if (leftTerm.coefficient !== rightTerm.coefficient) {
      return leftTerm.coefficient < rightTerm.coefficient ? -1 : 1;
    }
    i += 1;
  }
}

function compare(a, b) {
  const result = cmpOrdinal(a, b);
  return result === 0 ? 0 : result < 0 ? -1 : 1;
}

function isFixedPointCore(beta, coreTerms) {
  if (coreTerms.length !== 1) {
    return false;
  }
  const [only] = coreTerms;
  return only.coefficient === 1 && compare(only.phi.beta, beta) > 0;
}

function isFixedPointArgument(beta, gamma) {
  return isFixedPointCore(asOrdinal(beta), asOrdinal(gamma).terms);
}

function phiValue(beta, gamma) {
  const betaOrdinal = asOrdinal(beta);
  const gammaOrdinal = asOrdinal(gamma);
  if (isFixedPointArgument(betaOrdinal, gammaOrdinal)) {
    return gammaOrdinal;
  }
  return principal(betaOrdinal, gammaOrdinal);
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
  const only = value.terms[0];
  return fromTerms([
    uncheckedTerm(only.phi, assertSafeProduct(only.coefficient, coefficient, "coefficient")),
  ]);
}

function addFinite(ordinal, amount) {
  assertSafeNonnegativeInteger(amount, "amount");
  const value = asOrdinal(ordinal);
  if (amount === 0) {
    return value;
  }
  return fromTerms([...value.terms, uncheckedTerm(PHI_ONE, amount)]);
}

export function predecessor(ordinal) {
  const value = asOrdinal(ordinal);
  if (isZero(value)) {
    return null;
  }

  const last = value.terms[value.terms.length - 1];
  if (!isPhiOne(last.phi)) {
    return null;
  }

  const terms = value.terms.slice(0, -1);
  if (last.coefficient > 1) {
    terms.push(uncheckedTerm(PHI_ONE, last.coefficient - 1));
  }
  return fromTerms(terms);
}

function isLimit(ordinal) {
  const value = asOrdinal(ordinal);
  if (isZero(value)) {
    return false;
  }
  const last = value.terms[value.terms.length - 1];
  return !isPhiOne(last.phi);
}

function appendToPrefix(prefixTerms, tail) {
  const tailOrdinal = asOrdinal(tail);
  return fromTerms([...prefixTerms, ...tailOrdinal.terms]);
}

function iteratePhi(beta, seed, count) {
  let current = asOrdinal(seed);
  for (let i = 0; i < count; i += 1) {
    current = phiValue(beta, current);
  }
  return current;
}

function fsPrincipal(phiTerm, n) {
  const beta = phiTerm.beta;
  const gamma = phiTerm.gamma;

  if (isLimit(gamma)) {
    return phiValue(beta, fsOrdinal(gamma, n));
  }

  if (isZero(beta)) {
    const gammaPredecessor = predecessor(gamma);
    if (gammaPredecessor === null) {
      throw new RangeError("1 has no fundamental sequence");
    }
    return multiplyPrincipalValue(phiValue(zero, gammaPredecessor), n);
  }

  const betaPredecessor = predecessor(beta);
  if (betaPredecessor !== null) {
    if (isZero(gamma)) {
      return iteratePhi(betaPredecessor, zero, n);
    }

    const gammaPredecessor = predecessor(gamma);
    if (gammaPredecessor === null) {
      throw new RangeError("unexpected nonzero non-limit gamma without predecessor");
    }

    const seed = addFinite(phiValue(beta, gammaPredecessor), 1);
    return iteratePhi(betaPredecessor, seed, n);
  }

  if (isLimit(beta)) {
    const betaAtN = fsOrdinal(beta, n);
    if (isZero(gamma)) {
      return phiValue(betaAtN, zero);
    }

    const gammaPredecessor = predecessor(gamma);
    if (gammaPredecessor === null) {
      throw new RangeError("unexpected nonzero non-limit gamma without predecessor");
    }

    return phiValue(betaAtN, addFinite(phiValue(beta, gammaPredecessor), 1));
  }

  throw new RangeError("principal term is not a limit ordinal");
}

function fsOrdinal(ordinal, n) {
  const value = asOrdinal(ordinal);
  if (!isLimit(value)) {
    throw new RangeError("fsAt is defined here only for nonzero limit ordinals");
  }

  const activeIndex = value.terms.length - 1;
  const active = value.terms[activeIndex];
  const prefixTerms = value.terms.slice(0, activeIndex);
  const activeAtN = fsPrincipal(active.phi, n);

  if (active.coefficient > 1) {
    prefixTerms.push(uncheckedTerm(active.phi, active.coefficient - 1));
  }

  return appendToPrefix(prefixTerms, activeAtN);
}

function fsAt(alpha, n) {
  assertSafeNonnegativeInteger(n, "n");
  const value = asOrdinal(alpha);
  if (!isLimit(value)) {
    throw new RangeError("fsAt is defined here only for nonzero limit ordinals");
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

function phiToLatex(phiTerm) {
  const betaNat = asFiniteNat(phiTerm.beta);
  if (betaNat === 0) {
    if (isZero(phiTerm.gamma)) {
      return "1";
    }
    if (isOne(phiTerm.gamma)) {
      return "\\omega";
    }
    return `\\omega^{${toLatex(phiTerm.gamma)}}`;
  }

  if (betaNat === 1) {
    return `\\varepsilon_{${toLatex(phiTerm.gamma)}}`;
  }

  if (betaNat === 2) {
    return `\\zeta_{${toLatex(phiTerm.gamma)}}`;
  }

  return `\\varphi_{${toLatex(phiTerm.beta)}}(${toLatex(phiTerm.gamma)})`;
}

export function toLatex(ordinal) {
  const value = asOrdinal(ordinal);
  if (isZero(value)) {
    return "0";
  }

  const parts = [];
  for (const item of value.terms) {
    if (isPhiOne(item.phi)) {
      parts.push(String(item.coefficient));
      continue;
    }

    const rendered = phiToLatex(item.phi);
    parts.push(item.coefficient > 1 ? `${rendered}${item.coefficient}` : rendered);
  }
  return parts.join("+");
}
