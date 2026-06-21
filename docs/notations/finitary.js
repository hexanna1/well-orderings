function fail(message) {
  throw new Error(message);
}

function assertInteger(value, name, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    fail(`${name} must be a safe integer >= ${minimum}`);
  }
}

function checkedAdd(left, right, name) {
  const value = left + right;
  if (!Number.isSafeInteger(value)) {
    fail(`${name} exceeds Number.MAX_SAFE_INTEGER`);
  }
  return value;
}

function checkedMultiply(left, right, name) {
  const value = left * right;
  if (!Number.isSafeInteger(value)) {
    fail(`${name} exceeds Number.MAX_SAFE_INTEGER`);
  }
  return value;
}

function freezeVeblen(args) {
  return Object.freeze({ args: Object.freeze(args.slice()) });
}

function freezeTerm(veblen, coefficient) {
  return Object.freeze({ veblen, coefficient });
}

function freezeOrdinal(terms) {
  return Object.freeze({ terms: Object.freeze(terms.slice()) });
}

export const zero = freezeOrdinal([]);

const VEBLEN_ONE = freezeVeblen([zero]);
const ordinalKeyCache = new WeakMap();
const veblenKeyCache = new WeakMap();
const canonicalVeblenCache = new Map();
const canonicalOrdinalCache = new Map();
const finiteCache = new Map([[0, zero]]);
const ordinalCompareCache = new Map();
const veblenCompareCache = new Map();
const predecessorCache = new Map();
const limitCache = new Map();
const fsAtCache = new Map();
const childrenCache = new Map();

function isOrdinal(value) {
  return value && Array.isArray(value.terms);
}

function isVeblen(value) {
  return value && Array.isArray(value.args);
}

function rawAsVeblen(value) {
  if (isVeblen(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return { args: value };
  }
  fail("expected a Veblen node or argument array");
}

function rawTermParts(spec) {
  if (Array.isArray(spec)) {
    const [args, coefficient = 1] = spec;
    return { veblen: rawAsVeblen(args), coefficient };
  }
  if (spec && "veblen" in spec) {
    return { veblen: rawAsVeblen(spec.veblen), coefficient: spec.coefficient ?? spec.coeff ?? 1 };
  }
  if (spec && "args" in spec) {
    return { veblen: rawAsVeblen(spec.args), coefficient: spec.coefficient ?? spec.coeff ?? 1 };
  }
  fail("expected a term specification");
}

function keyOfVeblen(veblen) {
  const cached = veblenKeyCache.get(veblen);
  if (cached !== undefined) {
    return cached;
  }
  const key = `V(${veblen.args.map(keyOfOrdinal).join("")})`;
  veblenKeyCache.set(veblen, key);
  return key;
}

function keyOfOrdinal(value) {
  const cached = ordinalKeyCache.get(value);
  if (cached !== undefined) {
    return cached;
  }
  const key = `O(${value.terms
    .map(({ veblen, coefficient }) => `T(${keyOfVeblen(veblen)},${coefficient})`)
    .join("")})`;
  ordinalKeyCache.set(value, key);
  return key;
}

function pairKey(leftKey, rightKey) {
  return `${leftKey}<=>${rightKey}`;
}

function isVeblenOne(veblen) {
  return veblen.args.length === 1 && isZero(veblen.args[0]);
}

function asFiniteNat(value) {
  if (isZero(value)) {
    return 0;
  }
  if (value.terms.length !== 1) {
    return null;
  }
  const [{ veblen, coefficient }] = value.terms;
  return isVeblenOne(veblen) ? coefficient : null;
}

function isOne(value) {
  return asFiniteNat(value) === 1;
}

function argAt(args, index) {
  return index < args.length ? args[index] : zero;
}

function asPrincipalOrdinal(veblen) {
  return freezeOrdinal([freezeTerm(veblen, 1)]);
}

function cmpLesserRemainder(lesserArgs, differingIndex, greaterOrdinal) {
  for (let index = differingIndex - 1; index >= 0; index -= 1) {
    const argCmp = compareOrdinalUnchecked(argAt(lesserArgs, index), greaterOrdinal);
    if (argCmp < 0) {
      continue;
    }
    if (argCmp > 0) {
      return 1;
    }

    for (let lowerIndex = index - 1; lowerIndex >= 0; lowerIndex -= 1) {
      if (!isZero(argAt(lesserArgs, lowerIndex))) {
        return 1;
      }
    }
    return 0;
  }
  return -1;
}

function canonicalizeOrdinal(value) {
  if (!isOrdinal(value)) {
    fail("expected an ordinal");
  }
  if (isZero(value)) {
    return zero;
  }
  const cached = canonicalOrdinalCache.get(keyOfOrdinal(value));
  if (cached !== undefined) {
    return cached;
  }
  return fromTerms(value.terms);
}

function canonicalizeVeblen(value) {
  const raw = rawAsVeblen(value);
  if (raw.args.length < 1) {
    fail("Veblen term must have at least one argument");
  }

  const args = raw.args.map(canonicalizeOrdinal);
  while (args.length > 1 && isZero(args[args.length - 1])) {
    args.pop();
  }
  return freezeVeblen(args);
}

function isPreferredVeblen(veblen) {
  const principal = asPrincipalOrdinal(veblen);
  return veblen.args.every((arg) => compareOrdinalUnchecked(arg, principal) < 0);
}

function appendTerms(prefixTerms, suffix) {
  if (isZero(suffix)) {
    return prefixTerms.length === 0 ? zero : fromTerms(prefixTerms);
  }
  return fromTerms([...prefixTerms, ...suffix.terms]);
}

function principalWithCoefficient(args, coefficient = 1) {
  assertInteger(coefficient, "coefficient", 0);
  if (coefficient === 0) {
    return zero;
  }
  return principalValue(args, coefficient);
}

function multiplyPrincipalValue(value, coefficient) {
  assertInteger(coefficient, "coefficient", 0);
  if (coefficient === 0) {
    return zero;
  }
  const ordinalValue = canonicalizeOrdinal(value);
  if (coefficient === 1) {
    return ordinalValue;
  }
  if (ordinalValue.terms.length !== 1) {
    fail("nonpreferred Veblen alias is not additively principal");
  }
  const [only] = ordinalValue.terms;
  return fromTerms([
    freezeTerm(
      only.veblen,
      checkedMultiply(only.coefficient, coefficient, "coefficient"),
    ),
  ]);
}

function principalValue(args, coefficient = 1) {
  assertInteger(coefficient, "coefficient", 0);
  const node = canonicalizeVeblen(rawAsVeblen(args));
  if (isPreferredVeblen(node)) {
    return coefficient === 0 ? zero : fromTerms([freezeTerm(node, coefficient)]);
  }

  const rawOrdinal = asPrincipalOrdinal(node);
  for (const arg of node.args) {
    if (compareOrdinalUnchecked(arg, rawOrdinal) === 0) {
      return multiplyPrincipalValue(arg, coefficient);
    }
  }
  fail("nonpreferred Veblen descriptor is not an exact fixed-point alias");
}

function withoutFiniteTail(value) {
  const terms = value.terms.slice();
  if (terms.length === 0) {
    return { core: zero, tail: 0 };
  }
  const last = terms[terms.length - 1];
  if (!isVeblenOne(last.veblen)) {
    return { core: value, tail: 0 };
  }
  terms.pop();
  return { core: terms.length === 0 ? zero : fromTerms(terms), tail: last.coefficient };
}

function withFiniteTail(core, tail) {
  assertInteger(tail, "tail", 0);
  if (tail === 0) {
    return core;
  }
  return fromTerms([...core.terms, freezeTerm(VEBLEN_ONE, tail)]);
}

function firstNonzeroIndex(args, start) {
  for (let index = start; index < args.length; index += 1) {
    if (!isZero(args[index])) {
      return index;
    }
  }
  return -1;
}

function contextStep(templateArgs, pivot, pivotPredecessor, value) {
  const args = templateArgs.slice();
  for (let index = 0; index < pivot; index += 1) {
    args[index] = zero;
  }
  args[pivot - 1] = value;
  args[pivot] = pivotPredecessor;
  return principalValue(args);
}

function iterateContextStep(templateArgs, pivot, pivotPredecessor, start, count) {
  let value = start;
  for (let index = 0; index < count; index += 1) {
    value = contextStep(templateArgs, pivot, pivotPredecessor, value);
  }
  return value;
}

function contextLimitValue(templateArgs, pivot, pivotAt, activeValue) {
  const args = templateArgs.slice();
  for (let index = 0; index < pivot; index += 1) {
    args[index] = zero;
  }
  args[pivot - 1] = activeValue;
  args[pivot] = pivotAt;
  return principalValue(args);
}

function principalFsAt(node, n) {
  const args = node.args;
  const active = args[0];

  if (!isZero(active)) {
    const activePredecessor = predecessor(active);
    if (activePredecessor === null) {
      return principalValue([activeFsAt(active, n), ...args.slice(1)]);
    }

    if (args.length === 1) {
      return principalWithCoefficient([activePredecessor], n);
    }

    const pivot = firstNonzeroIndex(args, 1);
    if (pivot < 0) {
      fail("noncanonical Veblen context");
    }

    const seed = successor(principalValue([activePredecessor, ...args.slice(1)]));
    const pivotPredecessor = predecessor(args[pivot]);
    if (pivotPredecessor === null) {
      return contextLimitValue(args, pivot, activeFsAt(args[pivot], n), seed);
    }
    return iterateContextStep(args, pivot, pivotPredecessor, seed, n);
  }

  const pivot = firstNonzeroIndex(args, 1);
  if (pivot < 0) {
    fail("1 is not a limit ordinal");
  }

  const pivotPredecessor = predecessor(args[pivot]);
  if (pivotPredecessor === null) {
    return contextLimitValue(args, pivot, activeFsAt(args[pivot], n), zero);
  }
  return iterateContextStep(args, pivot, pivotPredecessor, zero, n);
}

function activeFsAt(value, n) {
  if (!isLimit(value)) {
    fail("fundamental sequence requested for a non-limit argument");
  }
  return fsAt(value, n);
}

function lastTermSplit(value) {
  if (isZero(value)) {
    return null;
  }
  const terms = value.terms.slice();
  const last = terms[terms.length - 1];
  if (last.coefficient === 1) {
    terms.pop();
  } else {
    terms[terms.length - 1] = freezeTerm(last.veblen, last.coefficient - 1);
  }
  return {
    prefixTerms: terms,
    active: asPrincipalOrdinal(last.veblen),
  };
}

function veblenNode(args) {
  const node = canonicalizeVeblen(rawAsVeblen(args));
  const key = keyOfVeblen(node);
  const cached = canonicalVeblenCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  if (!isPreferredVeblen(node)) {
    fail("Veblen node is not in preferred finitary normal form");
  }
  canonicalVeblenCache.set(key, node);
  return node;
}

function term(args, coefficient = 1) {
  assertInteger(coefficient, "coefficient", 1);
  return freezeTerm(veblenNode(args), coefficient);
}

function fromTerms(terms = []) {
  const counts = new Map();
  for (const spec of terms) {
    const { veblen, coefficient } = rawTermParts(spec);
    assertInteger(coefficient, "coefficient", 1);
    const node = veblenNode(veblen);
    const key = keyOfVeblen(node);
    const existing = counts.get(key);
    if (existing) {
      existing.coefficient = checkedAdd(existing.coefficient, coefficient, "coefficient");
    } else {
      counts.set(key, { veblen: node, coefficient });
    }
  }

  const normalized = [...counts.values()]
    .filter(({ coefficient }) => coefficient > 0)
    .sort((left, right) => -compareVeblen(left.veblen, right.veblen))
    .map(({ veblen, coefficient }) => freezeTerm(veblen, coefficient));

  if (normalized.length === 0) {
    return zero;
  }

  const value = freezeOrdinal(normalized);
  const key = keyOfOrdinal(value);
  const cached = canonicalOrdinalCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  canonicalOrdinalCache.set(key, value);
  return value;
}

function finite(n) {
  assertInteger(n, "n", 0);
  const cached = finiteCache.get(n);
  if (cached !== undefined) {
    return cached;
  }
  const value = freezeOrdinal([freezeTerm(VEBLEN_ONE, n)]);
  finiteCache.set(n, value);
  return value;
}

export const one = finite(1);

export function veblen(...args) {
  return fromTerms([term(args, 1)]);
}

function successor(value, amount = 1) {
  assertInteger(amount, "amount", 1);
  const ordinalValue = canonicalizeOrdinal(value);
  const { core, tail } = withoutFiniteTail(ordinalValue);
  return withFiniteTail(core, checkedAdd(tail, amount, "finite tail"));
}

function compareVeblen(left, right) {
  let a = canonicalizeVeblen(left);
  let b = canonicalizeVeblen(right);
  const aKey = keyOfVeblen(a);
  const bKey = keyOfVeblen(b);
  if (aKey === bKey) {
    return 0;
  }
  const cacheKey = pairKey(aKey, bKey);
  const cached = veblenCompareCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let result = 0;
  for (let index = Math.max(a.args.length, b.args.length) - 1; index >= 0; index -= 1) {
    const argCmp = compareOrdinalUnchecked(argAt(a.args, index), argAt(b.args, index));
    if (argCmp === 0) {
      continue;
    }
    if (index === 0) {
      result = argCmp;
      break;
    }
    if (argCmp < 0) {
      result = cmpLesserRemainder(a.args, index, asPrincipalOrdinal(b));
      break;
    }
    result = -cmpLesserRemainder(b.args, index, asPrincipalOrdinal(a));
    break;
  }
  veblenCompareCache.set(cacheKey, result);
  veblenCompareCache.set(pairKey(bKey, aKey), -result);
  return result;
}

function compareOrdinalUnchecked(left, right) {
  if (!isOrdinal(left) || !isOrdinal(right)) {
    fail("compare expects ordinals");
  }
  const a = left;
  const b = right;
  const aKey = keyOfOrdinal(a);
  const bKey = keyOfOrdinal(b);
  if (aKey === bKey) {
    return 0;
  }
  const cacheKey = pairKey(aKey, bKey);
  const cached = ordinalCompareCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  if (isZero(a)) {
    ordinalCompareCache.set(cacheKey, -1);
    ordinalCompareCache.set(pairKey(bKey, aKey), 1);
    return -1;
  }
  if (isZero(b)) {
    ordinalCompareCache.set(cacheKey, 1);
    ordinalCompareCache.set(pairKey(bKey, aKey), -1);
    return 1;
  }

  let ai = 0;
  let bi = 0;
  let result = 0;
  for (;;) {
    if (ai >= a.terms.length && bi >= b.terms.length) {
      result = 0;
      break;
    }
    if (ai >= a.terms.length) {
      result = -1;
      break;
    }
    if (bi >= b.terms.length) {
      result = 1;
      break;
    }

    const aTerm = a.terms[ai];
    const bTerm = b.terms[bi];
    const headCmp = compareVeblen(aTerm.veblen, bTerm.veblen);
    if (headCmp !== 0) {
      result = headCmp;
      break;
    }
    if (aTerm.coefficient !== bTerm.coefficient) {
      result = aTerm.coefficient < bTerm.coefficient ? -1 : 1;
      break;
    }
    ai += 1;
    bi += 1;
  }
  ordinalCompareCache.set(cacheKey, result);
  ordinalCompareCache.set(pairKey(bKey, aKey), -result);
  return result;
}

function compare(left, right) {
  return compareOrdinalUnchecked(canonicalizeOrdinal(left), canonicalizeOrdinal(right));
}

export function toLatex(value) {
  const ordinalValue = canonicalizeOrdinal(value);
  if (isZero(ordinalValue)) {
    return "0";
  }

  const parts = [];
  for (const { veblen: node, coefficient } of ordinalValue.terms) {
    if (isVeblenOne(node)) {
      parts.push(String(coefficient));
      continue;
    }
    let rendered = veblenToLatex(node);
    if (coefficient > 1) {
      rendered = `${rendered}${coefficient}`;
    }
    parts.push(rendered);
  }
  return parts.join("+");
}

function veblenToLatex(node) {
  const args = node.args;
  if (args.length === 3) {
    const [gamma, beta, alpha] = args;
    if (isOne(alpha) && isZero(beta)) {
      return `\\Gamma_{${toLatex(gamma)}}`;
    }
  }

  if (args.length === 1) {
    const [gamma] = args;
    if (isZero(gamma)) {
      return "1";
    }
    if (isOne(gamma)) {
      return "\\omega";
    }
    return `\\omega^{${toLatex(gamma)}}`;
  }

  if (args.length === 2) {
    const [gamma, beta] = args;
    const betaNat = asFiniteNat(beta);
    if (betaNat === 0) {
      return veblenToLatex(veblenNode([gamma]));
    }
    if (betaNat === 1) {
      return `\\varepsilon_{${toLatex(gamma)}}`;
    }
    if (betaNat === 2) {
      return `\\zeta_{${toLatex(gamma)}}`;
    }
    return `\\varphi_{${toLatex(beta)}}(${toLatex(gamma)})`;
  }

  return `\\varphi(${args.slice().reverse().map(toLatex).join(",")})`;
}

function isZero(value) {
  if (!isOrdinal(value)) {
    fail("expected an ordinal");
  }
  return value.terms.length === 0;
}

export function predecessor(value) {
  const ordinalValue = canonicalizeOrdinal(value);
  const cacheKey = keyOfOrdinal(ordinalValue);
  const cached = predecessorCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  let result;
  if (isZero(ordinalValue)) {
    result = null;
  } else {
    const terms = ordinalValue.terms.slice();
    const last = terms[terms.length - 1];
    if (!isVeblenOne(last.veblen)) {
      result = null;
    } else {
      if (last.coefficient === 1) {
        terms.pop();
      } else {
        terms[terms.length - 1] = freezeTerm(last.veblen, last.coefficient - 1);
      }
      result = terms.length === 0 ? zero : fromTerms(terms);
    }
  }
  predecessorCache.set(cacheKey, result);
  return result;
}

function isLimit(value) {
  const ordinalValue = canonicalizeOrdinal(value);
  const cacheKey = keyOfOrdinal(ordinalValue);
  const cached = limitCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = !isZero(ordinalValue) && predecessor(ordinalValue) === null;
  limitCache.set(cacheKey, result);
  return result;
}

function fsAt(value, n) {
  assertInteger(n, "n", 0);
  const ordinalValue = canonicalizeOrdinal(value);
  if (!isLimit(ordinalValue)) {
    fail("fsAt expects a nonzero limit ordinal");
  }

  const cacheKey = `${keyOfOrdinal(ordinalValue)}[${n}]`;
  const cached = fsAtCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const split = lastTermSplit(ordinalValue);
  if (split === null) {
    fail("fsAt expects a nonzero limit ordinal");
  }

  const { prefixTerms, active } = split;
  let result;
  if (prefixTerms.length > 0 || keyOfOrdinal(active) !== keyOfOrdinal(ordinalValue)) {
    result = appendTerms(prefixTerms, fsAt(active, n));
  } else {
    result = principalFsAt(active.terms[0].veblen, n);
  }

  fsAtCache.set(cacheKey, result);
  return result;
}

export function children(value, buttonCount = 4) {
  assertInteger(buttonCount, "buttonCount", 0);
  const ordinalValue = canonicalizeOrdinal(value);
  if (!isLimit(ordinalValue)) {
    return [];
  }
  const cacheKey = `${keyOfOrdinal(ordinalValue)}|${buttonCount}`;
  const cached = childrenCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = [];
  for (let index = 0; index < buttonCount; index += 1) {
    result.push(fsAt(ordinalValue, index));
  }
  const frozen = Object.freeze(result);
  childrenCache.set(cacheKey, frozen);
  return frozen;
}
