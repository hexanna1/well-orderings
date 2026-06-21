import {unpackRawPrincipal as unpackBuchholz1} from "./docs/notations/buchholz_1.js";
import {unpackRawPrincipal as unpackBuchholz} from "./docs/notations/buchholz.js";
import {unpackRawPrincipal as unpackEBOCF} from "./docs/notations/ebocf.js";

const unpackers = {buchholz_1: unpackBuchholz1, buchholz: unpackBuchholz, ebocf: unpackEBOCF};
const ZERO_CODE = 1, EMPTY_SUPPORT = 0;

// An odd slot count spreads prime keys over the whole table. Collisions only discard cached work.
function memoizeByCode(compute) {
  const capacity = 32_749;
  const keys = new Uint32Array(capacity), values = new Array(capacity);
  return (code) => {
    const slot = code % capacity;
    if (keys[slot] === code) return values[slot];
    const value = compute(code);
    keys[slot] = code;
    values[slot] = value;
    return value;
  };
}

export function createAdmissibilityScanner(name, primeIndex) {
  const unpackPrincipal = unpackers[name];
  const ordinalLevels = name === "ebocf", zeroLevel = ordinalLevels ? ZERO_CODE : 0;
  const compareLevels = ordinalLevels ? compareCodes : (left, right) => left - right;
  const principalForPrime = memoizeByCode((prime) => {
    const [level, arg] = unpackPrincipal(primeIndex.primeIndex(prime), primeIndex);
    return {level, arg, legal: undefined, greatestGuardAtZero: undefined};
  });
  const orderedFactors = memoizeByCode((code) => sortFactors(primeIndex.factorize(code)));

  function comparePrimes(left, right) {
    if (left === right) return 0;
    const a = principalForPrime(left), b = principalForPrime(right);
    return compareLevels(a.level, b.level) || compareCodes(a.arg, b.arg);
  }

  function sortFactors(factors) {
    return factors.length <= 1 ? factors : factors.toSorted(([a], [b]) => comparePrimes(b, a));
  }

  // Compare canonical sums lexicographically by principal, then multiplicity.
  function compareSums(left, right) {
    const length = Math.min(left.length, right.length);
    for (let i = 0; i < length; i += 1) {
      const order = comparePrimes(left[i][0], right[i][0]) || left[i][1] - right[i][1];
      if (order !== 0) return order;
    }
    return left.length - right.length;
  }

  function compareCodes(left, right) {
    if (left === right) return 0;
    if (left === ZERO_CODE) return -1;
    if (right === ZERO_CODE) return 1;
    return compareSums(orderedFactors(left), orderedFactors(right));
  }

  function greaterGuard(left, right) {
    if (left === EMPTY_SUPPORT) return right;
    if (right === EMPTY_SUPPORT) return left;
    return compareCodes(left, right) < 0 ? right : left;
  }

  function greatestGuard(level, principal) {
    if (level === zeroLevel && principal.greatestGuardAtZero !== undefined) {
      return principal.greatestGuardAtZero;
    }
    const order = compareLevels(principal.level, level);
    let greatest = EMPTY_SUPPORT;
    if (order >= 0) {
      greatest = principal.arg;
      // At equal levels legality already puts every guard of the argument below it.
      if (order > 0) greatest = includeGuards(level, principal.arg, greatest);
      if (ordinalLevels) greatest = includeGuards(level, principal.level, greatest);
    }
    if (level === zeroLevel) principal.greatestGuardAtZero = greatest;
    return greatest;
  }

  function includeGuards(level, code, greatest) {
    for (const [prime] of orderedFactors(code)) {
      greatest = greaterGuard(greatest, greatestGuard(level, principalForPrime(prime)));
    }
    return greatest;
  }

  function isLegal(principal) {
    if (principal.legal === undefined) {
      const {level, arg} = principal;
      principal.legal = (
        (!ordinalLevels || orderedFactors(level).every(([prime]) => isLegal(principalForPrime(prime)))) &&
        isAdmissible(level, arg)
      );
    }
    return principal.legal;
  }

  function isAdmissible(level, code, sieveFactors) {
    const factors = sieveFactors ?? orderedFactors(code);
    let greatest = EMPTY_SUPPORT;
    for (const [prime] of factors) {
      const principal = principalForPrime(prime);
      if (!isLegal(principal)) return false;
      greatest = greaterGuard(greatest, greatestGuard(level, principal));
    }
    if (greatest === EMPTY_SUPPORT) return true;
    if (greatest === code) return false;
    if (greatest === ZERO_CODE) return true;
    const candidate = sieveFactors === undefined ? factors : sortFactors(factors);
    return compareSums(orderedFactors(greatest), candidate) < 0;
  }

  return (code, factors) => isAdmissible(zeroLevel, code, factors);
}
