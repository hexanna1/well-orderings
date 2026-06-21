import {cachedByNumber, weakPairGet, weakPairSet} from "./cache.js";
import {
  boundedMultiplyPower, boundedPrimePowerProduct, cacheIntegerValue,
} from "../natural_number_encoding.js";

function fail(message) { throw new Error(message); }

function checkedAdd(left, right, name) {
  const value = left + right;
  if (!Number.isSafeInteger(value)) fail(`${name} exceeds Number.MAX_SAFE_INTEGER`);
  return value;
}

function checkedMultiply(left, right, name) {
  const value = left * right;
  if (!Number.isSafeInteger(value)) fail(`${name} exceeds Number.MAX_SAFE_INTEGER`);
  return value;
}

function freezeVeblen(args) { return Object.freeze({args: Object.freeze(args.slice())}); }

function freezeTerm(veblen, coefficient) { return Object.freeze({veblen, coefficient}); }

function freezeOrdinal(terms) { return Object.freeze({terms: Object.freeze(terms.slice())}); }

export const zero = freezeOrdinal([]);

const VEBLEN_ONE = freezeVeblen([zero]), ordinalKeyCache = new WeakMap();
const veblenKeyCache = new WeakMap(), canonicalVeblenCache = new WeakMap();
const canonicalOrdinalCache = new WeakMap(), finiteCache = new Map([[0, zero]]);
const ordinalCompareCache = new WeakMap(), veblenCompareCache = new WeakMap();
const predecessorCache = new WeakMap(), limitCache = new WeakMap();
const fsAtCache = new WeakMap(), childrenCache = new WeakMap();

function isOrdinal(value) { return value && Array.isArray(value.terms); }

function isVeblen(value) { return value && Array.isArray(value.args); }

function rawAsVeblen(value) {
  if (isVeblen(value)) return value;
  if (Array.isArray(value)) return {args: value};
  fail("expected a Veblen node or argument array");
}

function rawTermParts(spec) {
  if (Array.isArray(spec)) {
    const [args, coefficient = 1] = spec;
    return {veblen: rawAsVeblen(args), coefficient};
  }
  if (spec && "veblen" in spec) return {veblen: rawAsVeblen(spec.veblen), coefficient: spec.coefficient ?? 1};
  if (spec && "args" in spec) return {veblen: rawAsVeblen(spec.args), coefficient: spec.coefficient ?? 1};
  fail("expected a term specification");
}

function keyOfVeblen(veblen) {
  const cached = veblenKeyCache.get(veblen);
  if (cached !== undefined) return cached;
  const key = `V(${veblen.args.map(keyOfOrdinal).join("")})`;
  veblenKeyCache.set(veblen, key);
  return key;
}

function keyOfOrdinal(value) {
  const cached = ordinalKeyCache.get(value);
  if (cached !== undefined) return cached;
  const key = `O(${value.terms .map(({veblen, coefficient}) => `T(${keyOfVeblen(veblen)},${coefficient})`)
    .join("")})`;
  ordinalKeyCache.set(value, key);
  return key;
}

function isVeblenOne(veblen) { return veblen.args.length === 1 && isZero(veblen.args[0]); }

function asFiniteNat(value) {
  if (isZero(value)) return 0;
  if (value.terms.length !== 1) return null;
  const [{veblen, coefficient}] = value.terms;
  return isVeblenOne(veblen) ? coefficient : null;
}

function isOne(value) { return asFiniteNat(value) === 1; }

function argAt(args, index) { return index < args.length ? args[index] : zero; }

function asPrincipalOrdinal(veblen) { return freezeOrdinal([freezeTerm(veblen, 1)]); }

function cmpLesserRemainder(lesserArgs, differingIndex, greaterOrdinal) {
  for (let index = differingIndex - 1; index >= 0; index -= 1) {
    const argCmp = compareOrdinalUnchecked(argAt(lesserArgs, index), greaterOrdinal);
    if (argCmp < 0) continue;
    if (argCmp > 0) return 1;

    for (let lowerIndex = index - 1; lowerIndex >= 0; lowerIndex -= 1) { if (!isZero(argAt(lesserArgs, lowerIndex))) return 1; }
    return 0;
  }
  return -1;
}

function canonicalizeOrdinal(value) {
  if (!isOrdinal(value)) fail("expected an ordinal");
  if (isZero(value)) return zero;
  const cached = canonicalOrdinalCache.get(value);
  if (cached !== undefined) return cached;
  const result = fromTerms(value.terms);
  canonicalOrdinalCache.set(value, result);
  return result;
}

function canonicalizeVeblen(value) {
  const raw = rawAsVeblen(value);
  if (raw.args.length < 1) fail("Veblen term must have at least one argument");

  const cached = canonicalVeblenCache.get(raw);
  if (cached !== undefined) return cached;
  const args = raw.args.map(canonicalizeOrdinal);
  while (args.length > 1 && isZero(args[args.length - 1])) { args.pop(); }
  const result = freezeVeblen(args);
  canonicalVeblenCache.set(raw, result);
  return result;
}

function isPreferredVeblen(veblen) {
  const principal = asPrincipalOrdinal(veblen);
  return veblen.args.every((arg) => compareOrdinalUnchecked(arg, principal) < 0);
}

function appendTerms(prefixTerms, suffix) {
  if (isZero(suffix)) return prefixTerms.length === 0 ? zero : fromTerms(prefixTerms);
  return fromTerms([...prefixTerms, ...suffix.terms]);
}

function principalWithCoefficient(args, coefficient = 1) {
  if (coefficient === 0) return zero;
  return principalValue(args, coefficient);
}

function multiplyPrincipalValue(value, coefficient) {
  if (coefficient === 0) return zero;
  const ordinalValue = canonicalizeOrdinal(value);
  if (coefficient === 1) return ordinalValue;
  if (ordinalValue.terms.length !== 1) fail("nonpreferred Veblen alias is not additively principal");
  const [only] = ordinalValue.terms;
  return fromTerms([freezeTerm(only.veblen, checkedMultiply(only.coefficient, coefficient, "coefficient"))]);
}

function principalValue(args, coefficient = 1) {
  const node = canonicalizeVeblen(rawAsVeblen(args));
  if (isPreferredVeblen(node)) return coefficient === 0 ? zero : fromTerms([freezeTerm(node, coefficient)]);

  const rawOrdinal = asPrincipalOrdinal(node);
  for (const arg of node.args) {
    if (compareOrdinalUnchecked(arg, rawOrdinal) === 0) return multiplyPrincipalValue(arg, coefficient);
  }
  fail("nonpreferred Veblen descriptor is not an exact fixed-point alias");
}

function withoutFiniteTail(value) {
  const terms = value.terms.slice();
  if (terms.length === 0) return {core: zero, tail: 0};
  const last = terms[terms.length - 1];
  if (!isVeblenOne(last.veblen)) return {core: value, tail: 0};
  terms.pop();
  return {core: terms.length === 0 ? zero : fromTerms(terms), tail: last.coefficient};
}

function withFiniteTail(core, tail) {
  if (tail === 0) return core;
  return fromTerms([...core.terms, freezeTerm(VEBLEN_ONE, tail)]);
}

function repairFixedPointTails(args) {
  if (args.length === 0) return args;
  const {core, tail} = withoutFiniteTail(args[0]), context = args.slice(1);
  if (isPreferredVeblen(canonicalizeVeblen([core, ...context]))) return args;
  return [withFiniteTail(core, tail + 1), ...context];
}

function undoFixedPointTailRepairs(args) {
  if (args.length === 0) return args;
  const {core, tail} = withoutFiniteTail(args[0]), context = args.slice(1);
  if (tail < 1 || isPreferredVeblen(canonicalizeVeblen([core, ...context]))) return args;
  return [withFiniteTail(core, tail - 1), ...context];
}

function firstNonzeroIndex(args, start) {
  for (let index = start; index < args.length; index += 1) { if (!isZero(args[index])) return index; }
  return -1;
}

function contextStep(templateArgs, pivot, pivotPredecessor, value) {
  const args = templateArgs.slice();
  for (let index = 0; index < pivot; index += 1) { args[index] = zero; }
  args[pivot - 1] = value;
  args[pivot] = pivotPredecessor;
  return principalValue(args);
}

function iterateContextStep(templateArgs, pivot, pivotPredecessor, start, count) {
  let value = start;
  for (let index = 0; index < count; index += 1) { value = contextStep(templateArgs, pivot, pivotPredecessor, value); }
  return value;
}

function contextLimitValue(templateArgs, pivot, pivotAt, activeValue) {
  const args = templateArgs.slice();
  for (let index = 0; index < pivot; index += 1) { args[index] = zero; }
  args[pivot - 1] = activeValue;
  args[pivot] = pivotAt;
  return principalValue(args);
}

function principalFsAt(node, n) {
  const args = node.args, active = args[0];

  if (!isZero(active)) {
    const activePredecessor = predecessor(active);
    if (activePredecessor === null) return principalValue([activeFsAt(active, n), ...args.slice(1)]);

    if (args.length === 1) return principalWithCoefficient([activePredecessor], n);

    const pivot = firstNonzeroIndex(args, 1);
    if (pivot < 0) fail("noncanonical Veblen context");

    const seed = successor(principalValue([activePredecessor, ...args.slice(1)]));
    const pivotPredecessor = predecessor(args[pivot]);
    if (pivotPredecessor === null) return contextLimitValue(args, pivot, activeFsAt(args[pivot], n), seed);
    return iterateContextStep(args, pivot, pivotPredecessor, seed, n);
  }

  const pivot = firstNonzeroIndex(args, 1);
  if (pivot < 0) fail("1 is not a limit ordinal");

  const pivotPredecessor = predecessor(args[pivot]);
  if (pivotPredecessor === null) return contextLimitValue(args, pivot, activeFsAt(args[pivot], n), zero);
  return iterateContextStep(args, pivot, pivotPredecessor, zero, n);
}

function activeFsAt(value, n) {
  if (!isLimit(value)) fail("fundamental sequence requested for a non-limit argument");
  return fsAt(value, n);
}

function lastTermSplit(value) {
  if (isZero(value)) return null;
  const terms = value.terms.slice(), last = terms[terms.length - 1];
  if (last.coefficient === 1) {
    terms.pop();
  } else {
    terms[terms.length - 1] = freezeTerm(last.veblen, last.coefficient - 1);
  }
  return {prefixTerms: terms, active: asPrincipalOrdinal(last.veblen)};
}

function veblenNode(args) {
  const node = canonicalizeVeblen(rawAsVeblen(args));
  if (!isPreferredVeblen(node)) fail("Veblen node is not in preferred finitary normal form");
  canonicalVeblenCache.set(node, node);
  return node;
}

function term(args, coefficient = 1) { return freezeTerm(veblenNode(args), coefficient); }

function fromTerms(terms = []) {
  const counts = new Map();
  for (const spec of terms) {
    const {veblen, coefficient} = rawTermParts(spec), node = veblenNode(veblen);
    const key = keyOfVeblen(node), existing = counts.get(key);
    if (existing) {
      existing.coefficient = checkedAdd(existing.coefficient, coefficient, "coefficient");
    } else {
      counts.set(key, {veblen: node, coefficient});
    }
  }

  const normalized = [...counts.values()] .filter(({coefficient}) => coefficient > 0)
    .sort((left, right) => -compareVeblen(left.veblen, right.veblen))
    .map(({veblen, coefficient}) => freezeTerm(veblen, coefficient));

  if (normalized.length === 0) return zero;

  const value = freezeOrdinal(normalized);
  canonicalOrdinalCache.set(value, value);
  return value;
}

function finite(n) {
  const cached = finiteCache.get(n);
  if (cached !== undefined) return cached;
  const value = freezeOrdinal([freezeTerm(VEBLEN_ONE, n)]);
  finiteCache.set(n, value);
  return value;
}

export const one = finite(1);

export function veblen(...args) { return fromTerms([term(args, 1)]); }

export function createEncoder(primeIndex) {
  const ordinalCache = new Map(), naturalCache = new WeakMap();

  function ordinal(n) {
    const cached = ordinalCache.get(n);
    if (cached !== undefined) return cached;

    const terms = primeIndex.factorize(n).map(([prime, coefficient]) => {
      const argumentCodes = new Map();
      for (const [sourcePrime, exponent] of primeIndex.factorize(primeIndex.primeIndex(prime))) {
        let sourceIndex = primeIndex.primeIndex(sourcePrime), argumentIndex = 0;
        while (sourceIndex % 2 === 0) {
          sourceIndex /= 2;
          argumentIndex += 1;
        }
        const childPrime = primeIndex.primeAtIndex((sourceIndex + 1) / 2);
        argumentCodes.set(argumentIndex, (argumentCodes.get(argumentIndex) ?? 1) * childPrime ** exponent);
      }
      const maximumArgument = Math.max(0, ...argumentCodes.keys());
      const args = Array.from(
        {length: maximumArgument + 1},
        (_, index) => ordinal(argumentCodes.get(index) ?? 1),
      );
      return freezeTerm(veblenNode(repairFixedPointTails(args)), coefficient);
    });
    const value = fromTerms(terms);
    return cacheIntegerValue(ordinalCache, n, value);
  }

  function encodeChildCodeAtArgument(code, argumentIndex) {
    if (code === null) return null;
    let encoded = 1;
    for (const [prime, exponent] of primeIndex.factorize(code)) {
      const childIndex = primeIndex.primeIndex(prime);
      const sourceIndex = (2 ** argumentIndex) * (2 * childIndex - 1);
      encoded = boundedPrimePowerProduct(encoded, sourceIndex, exponent, primeIndex);
      if (encoded === null) return null;
    }
    return encoded;
  }

  function indexFromVeblen(veblenValue) {
    const node = canonicalizeVeblen(veblenValue);
    if (!isPreferredVeblen(node)) return null;

    let index = 1;
    for (const [argumentIndex, arg] of undoFixedPointTailRepairs(node.args).entries()) {
      const encoded = encodeChildCodeAtArgument(natural(arg), argumentIndex);
      if (encoded === null) return null;
      index = boundedMultiplyPower(index, encoded, 1, primeIndex.maximum);
      if (index === null) return null;
    }
    return index;
  }

  function natural(value) {
    const ordinalValue = canonicalizeOrdinal(value), cached = naturalCache.get(ordinalValue);
    if (cached !== undefined) return cached;

    let n = 1;
    for (const {veblen: veblenValue, coefficient} of ordinalValue.terms) {
      n = boundedPrimePowerProduct(n, indexFromVeblen(veblenValue), coefficient, primeIndex);
      if (n === null) break;
    }
    naturalCache.set(ordinalValue, n);
    return n;
  }

  return Object.freeze({ordinal, natural});
}

function successor(value, amount = 1) {
  const ordinalValue = canonicalizeOrdinal(value), {core, tail} = withoutFiniteTail(ordinalValue);
  return withFiniteTail(core, checkedAdd(tail, amount, "finite tail"));
}

function compareVeblen(left, right) {
  let a = canonicalizeVeblen(left), b = canonicalizeVeblen(right);
  const aKey = keyOfVeblen(a), bKey = keyOfVeblen(b);
  if (aKey === bKey) return 0;
  const cached = weakPairGet(veblenCompareCache, a, b);
  if (cached !== undefined) return cached;

  let result = 0;
  for (let index = Math.max(a.args.length, b.args.length) - 1; index >= 0; index -= 1) {
    const argCmp = compareOrdinalUnchecked(argAt(a.args, index), argAt(b.args, index));
    if (argCmp === 0) continue;
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
  weakPairSet(veblenCompareCache, a, b, result);
  weakPairSet(veblenCompareCache, b, a, -result);
  return result;
}

function compareOrdinalUnchecked(left, right) {
  if (!isOrdinal(left) || !isOrdinal(right)) fail("compare expects ordinals");
  const aKey = keyOfOrdinal(left), bKey = keyOfOrdinal(right);
  if (aKey === bKey) return 0;
  const cached = weakPairGet(ordinalCompareCache, left, right);
  if (cached !== undefined) return cached;
  if (isZero(left)) {
    weakPairSet(ordinalCompareCache, left, right, -1);
    weakPairSet(ordinalCompareCache, right, left, 1);
    return -1;
  }
  if (isZero(right)) {
    weakPairSet(ordinalCompareCache, left, right, 1);
    weakPairSet(ordinalCompareCache, right, left, -1);
    return 1;
  }

  let result = Math.sign(left.terms.length - right.terms.length);
  for (let i = 0; i < Math.min(left.terms.length, right.terms.length); i += 1) {
    const aTerm = left.terms[i], bTerm = right.terms[i], headCmp = compareVeblen(aTerm.veblen, bTerm.veblen);
    if (headCmp !== 0) {
      result = headCmp;
      break;
    }
    if (aTerm.coefficient !== bTerm.coefficient) {
      result = aTerm.coefficient < bTerm.coefficient ? -1 : 1;
      break;
    }
  }
  weakPairSet(ordinalCompareCache, left, right, result);
  weakPairSet(ordinalCompareCache, right, left, -result);
  return result;
}

export function toLatex(value) {
  const ordinalValue = canonicalizeOrdinal(value);
  if (isZero(ordinalValue)) return "0";

  const parts = [];
  for (const {veblen: node, coefficient} of ordinalValue.terms) {
    if (isVeblenOne(node)) {
      parts.push(String(coefficient));
      continue;
    }
    let rendered = veblenToLatex(node);
    if (coefficient > 1) rendered = `${rendered}${coefficient}`;
    parts.push(rendered);
  }
  return parts.join("+");
}

function veblenToLatex(node) {
  const args = node.args;
  if (args.length === 3) {
    const [gamma, beta, alpha] = args;
    if (isOne(alpha) && isZero(beta)) return `\\Gamma_{${toLatex(gamma)}}`;
  }

  if (args.length === 1) {
    const [gamma] = args;
    if (isZero(gamma)) return "1";
    if (isOne(gamma)) return "\\omega";
    return `\\omega^{${toLatex(gamma)}}`;
  }

  if (args.length === 2) {
    const [gamma, beta] = args, betaNat = asFiniteNat(beta);
    if (betaNat === 0) return veblenToLatex(veblenNode([gamma]));
    if (betaNat === 1) return `\\varepsilon_{${toLatex(gamma)}}`;
    if (betaNat === 2) return `\\zeta_{${toLatex(gamma)}}`;
    return `\\varphi_{${toLatex(beta)}}(${toLatex(gamma)})`;
  }

  return `\\varphi(${args.slice().reverse().map(toLatex).join(",")})`;
}

function isZero(value) {
  if (!isOrdinal(value)) fail("expected an ordinal");
  return value.terms.length === 0;
}

export function predecessor(value) {
  const ordinalValue = canonicalizeOrdinal(value), cached = predecessorCache.get(ordinalValue);
  if (cached !== undefined) return cached;
  let result;
  if (isZero(ordinalValue)) {
    result = null;
  } else {
    const terms = ordinalValue.terms.slice(), last = terms[terms.length - 1];
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
  predecessorCache.set(ordinalValue, result);
  return result;
}

function isLimit(value) {
  const ordinalValue = canonicalizeOrdinal(value), cached = limitCache.get(ordinalValue);
  if (cached !== undefined) return cached;
  const result = !isZero(ordinalValue) && predecessor(ordinalValue) === null;
  limitCache.set(ordinalValue, result);
  return result;
}

function fsAt(value, n) {
  const ordinalValue = canonicalizeOrdinal(value);
  if (!isLimit(ordinalValue)) fail("fsAt expects a nonzero limit ordinal");

  return cachedByNumber(fsAtCache, ordinalValue, n, () => {
    const split = lastTermSplit(ordinalValue);
    if (split === null) fail("fsAt expects a nonzero limit ordinal");

    const {prefixTerms, active} = split;
    if (prefixTerms.length > 0 || keyOfOrdinal(active) !== keyOfOrdinal(ordinalValue)) {
      return appendTerms(prefixTerms, fsAt(active, n));
    }
    return principalFsAt(active.terms[0].veblen, n);
  });
}

export function children(value, buttonCount = 4) {
  const ordinalValue = canonicalizeOrdinal(value);
  if (!isLimit(ordinalValue)) return [];
  return cachedByNumber(childrenCache, ordinalValue, buttonCount, () => {
    const result = [];
    for (let index = 0; index < buttonCount; index += 1) { result.push(fsAt(ordinalValue, index)); }
    return Object.freeze(result);
  });
}
