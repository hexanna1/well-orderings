const PRIME_DATA_MAGIC = "PRI1";
const ADMISSIBLE_DATA_MAGIC = "ADM1";
const HEADER_SIZE = 16;
const CACHE_LIMIT = 2000;
const UINT32_MAXIMUM = 0xffff_ffff;

function readMagic(bytes) {
  return String.fromCharCode(...bytes.subarray(0, 4));
}

function assertIntegerInRange(value, minimum, maximum, name) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} through ${maximum}`);
  }
}

export function cacheIntegerValue(cache, key, value) {
  if (cache.size >= CACHE_LIMIT && !cache.has(key)) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, value);
  return value;
}

export function boundedMultiplyPower(product, base, exponent, maximum) {
  assertIntegerInRange(product, 1, maximum, "product");
  assertIntegerInRange(base, 1, maximum, "base");
  assertIntegerInRange(exponent, 0, Number.MAX_SAFE_INTEGER, "exponent");

  let result = product;
  let factor = base;
  let remaining = exponent;
  while (remaining > 0) {
    if (remaining % 2 === 1) {
      if (result > Math.floor(maximum / factor)) {
        return null;
      }
      result *= factor;
    }
    remaining = Math.floor(remaining / 2);
    if (remaining > 0) {
      if (factor > Math.floor(maximum / factor)) {
        return null;
      }
      factor *= factor;
    }
  }
  return result;
}

export function boundedPrimePowerProduct(product, index, exponent, primeIndex) {
  if (
    product === null || !Number.isSafeInteger(index) || index < 1 ||
    index > primeIndex.maximumRank
  ) {
    return null;
  }
  return boundedMultiplyPower(
    product,
    primeIndex.primeAtIndex(index),
    exponent,
    primeIndex.maximum,
  );
}

export class PrimeIndex {
  constructor(maximum, blockSize, counts) {
    assertIntegerInRange(maximum, 2, UINT32_MAXIMUM, "maximum");
    assertIntegerInRange(blockSize, 1, UINT32_MAXIMUM, "block size");
    if (!(counts instanceof Uint32Array) || counts.length < 2) {
      throw new TypeError("counts must be a Uint32Array with at least two entries");
    }
    if (
      counts.length !== Math.floor(maximum / blockSize) + 2 ||
      counts[0] !== 0 ||
      counts.some((count, index) => index > 0 && count < counts[index - 1])
    ) {
      throw new Error("Invalid cumulative prime counts");
    }
    this.maximum = maximum;
    this.blockSize = blockSize;
    this.counts = counts;
    this.maximumRank = counts[counts.length - 1];
    this.basePrimes = this.#smallPrimes(Math.floor(Math.sqrt(maximum)));
    this.blockCache = new Map();
    this.factorCache = new Map();
    this.primeIndexCache = new Map();
    this.primeAtIndexCache = new Map();
  }

  #smallPrimes(limit) {
    const prime = new Uint8Array(limit + 1);
    prime.fill(1, 2);
    for (let p = 2; p * p <= limit; p += 1) {
      if (!prime[p]) {
        continue;
      }
      for (let multiple = p * p; multiple <= limit; multiple += p) {
        prime[multiple] = 0;
      }
    }
    const result = [];
    for (let p = 2; p <= limit; p += 1) {
      if (prime[p]) {
        result.push(p);
      }
    }
    return result;
  }

  #block(blockIndex) {
    const cached = this.blockCache.get(blockIndex);
    if (cached !== undefined) {
      return cached;
    }
    const start = blockIndex * this.blockSize;
    const end = Math.min(this.maximum + 1, start + this.blockSize);
    const prime = new Uint8Array(end - start);
    prime.fill(1);
    for (const p of this.basePrimes) {
      if (p * p >= end) {
        break;
      }
      const first = Math.max(p * p, Math.ceil(start / p) * p);
      for (let multiple = first; multiple < end; multiple += p) {
        prime[multiple - start] = 0;
      }
    }
    for (let value = start; value < Math.min(end, 2); value += 1) {
      prime[value - start] = 0;
    }
    const primes = [];
    for (let offset = 0; offset < prime.length; offset += 1) {
      if (prime[offset]) {
        primes.push(start + offset);
      }
    }
    if (this.blockCache.size >= 256) {
      this.blockCache.delete(this.blockCache.keys().next().value);
    }
    this.blockCache.set(blockIndex, primes);
    return primes;
  }

  #lowerBound(values, target) {
    let low = 0;
    let high = values.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (values[middle] < target) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    return low;
  }

  factorize(n) {
    assertIntegerInRange(n, 1, this.maximum, "n");
    const cached = this.factorCache.get(n);
    if (cached !== undefined) {
      return cached;
    }
    const factors = [];
    let remainder = n;
    for (const p of this.basePrimes) {
      if (p * p > remainder) {
        break;
      }
      if (remainder % p !== 0) {
        continue;
      }
      let exponent = 0;
      do {
        remainder /= p;
        exponent += 1;
      } while (remainder % p === 0);
      factors.push(Object.freeze([p, exponent]));
    }
    if (remainder > 1) {
      factors.push(Object.freeze([remainder, 1]));
    }
    return cacheIntegerValue(this.factorCache, n, Object.freeze(factors));
  }

  primeIndex(prime) {
    assertIntegerInRange(prime, 2, this.maximum, "prime");
    const cached = this.primeIndexCache.get(prime);
    if (cached !== undefined) {
      return cached;
    }
    const blockIndex = Math.floor(prime / this.blockSize);
    const primes = this.#block(blockIndex);
    const low = this.#lowerBound(primes, prime);
    if (primes[low] !== prime) {
      throw new RangeError(`${prime} is not prime`);
    }
    const index = this.counts[blockIndex] + low + 1;
    cacheIntegerValue(this.primeAtIndexCache, index, prime);
    return cacheIntegerValue(this.primeIndexCache, prime, index);
  }

  primeAtIndex(index) {
    assertIntegerInRange(index, 1, this.maximumRank, "prime index");
    const cached = this.primeAtIndexCache.get(index);
    if (cached !== undefined) {
      return cached;
    }
    let low = 0;
    let high = this.counts.length - 1;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if (this.counts[middle] < index) {
        low = middle;
      } else {
        high = middle;
      }
    }
    const prime = this.#block(low)[index - this.counts[low] - 1];
    cacheIntegerValue(this.primeIndexCache, prime, index);
    return cacheIntegerValue(this.primeAtIndexCache, index, prime);
  }

  previousPrime(n) {
    assertIntegerInRange(n, 1, this.maximum, "n");
    let blockIndex = Math.floor(n / this.blockSize);
    while (blockIndex >= 0) {
      const primes = this.#block(blockIndex);
      const low = this.#lowerBound(primes, n);
      if (low > 0) {
        return primes[low - 1];
      }
      blockIndex -= 1;
    }
    return null;
  }

  nextPrime(n) {
    assertIntegerInRange(n, 1, this.maximum, "n");
    const blockCount = this.counts.length - 1;
    let blockIndex = Math.floor(n / this.blockSize);
    while (blockIndex < blockCount) {
      const primes = this.#block(blockIndex);
      const low = this.#lowerBound(primes, n + 1);
      if (low < primes.length) {
        return primes[low];
      }
      blockIndex += 1;
    }
    return null;
  }
}

export function createSievedPrimeIndex(maximum, blockSize = 32768) {
  assertIntegerInRange(maximum, 2, UINT32_MAXIMUM, "maximum");
  assertIntegerInRange(blockSize, 1, UINT32_MAXIMUM, "block size");
  const prime = new Uint8Array(maximum + 1);
  prime.fill(1, 2);
  for (let p = 2; p * p <= maximum; p += 1) {
    if (!prime[p]) {
      continue;
    }
    for (let multiple = p * p; multiple <= maximum; multiple += p) {
      prime[multiple] = 0;
    }
  }

  const blockCount = Math.floor(maximum / blockSize) + 1;
  const counts = new Uint32Array(blockCount + 1);
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const start = blockIndex * blockSize;
    const end = Math.min(maximum + 1, start + blockSize);
    let count = counts[blockIndex];
    for (let value = start; value < end; value += 1) {
      count += prime[value];
    }
    counts[blockIndex + 1] = count;
  }
  return new PrimeIndex(maximum, blockSize, counts);
}

export function decodePrimeIndexData(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < HEADER_SIZE) {
    throw new Error("Invalid prime-index data");
  }
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (readMagic(bytes) !== PRIME_DATA_MAGIC) {
    throw new Error("Invalid prime-index data");
  }
  const maximum = view.getUint32(4, true);
  const blockSize = view.getUint32(8, true);
  const count = view.getUint32(12, true);
  if (count < 2 || buffer.byteLength !== HEADER_SIZE + 2 * (count - 1)) {
    throw new Error("Invalid prime-index data size");
  }
  const counts = new Uint32Array(count);
  for (let index = 1; index < count; index += 1) {
    counts[index] = counts[index - 1] + view.getUint16(
      HEADER_SIZE + 2 * (index - 1),
      true,
    );
  }
  return new PrimeIndex(maximum, blockSize, counts);
}

export function decodeAdmissibleData(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < HEADER_SIZE) {
    throw new Error("Invalid admissibility data");
  }
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (readMagic(bytes) !== ADMISSIBLE_DATA_MAGIC) {
    throw new Error("Invalid admissibility data");
  }
  const maximumRank = view.getUint32(4, true);
  const segmentCount = view.getUint32(8, true);
  const checkpointCount = view.getUint32(12, true);
  if (maximumRank < 1 || segmentCount < 1 || checkpointCount < 1) {
    throw new Error("Invalid admissibility data size");
  }

  const checkpoints = new Uint32Array(checkpointCount);
  const segments = [];
  let offset = HEADER_SIZE;
  let checkpointOffset = 0;
  let previousCheckpointRank = -1;
  let previousRawCode = -1;
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    if (offset + 24 > buffer.byteLength) {
      throw new Error("Invalid admissibility segment");
    }
    const startRank = view.getUint32(offset, true);
    const stride = view.getUint32(offset + 4, true);
    const count = view.getUint32(offset + 8, true);
    const bits = view.getUint8(offset + 12);
    const baseline = view.getUint32(offset + 16, true);
    if (
      (segmentIndex === 0 ? startRank !== 0 : startRank <= previousCheckpointRank) ||
      startRank > maximumRank ||
      stride < 1 || count < 1 || bits > 32 ||
      checkpointOffset + count > checkpointCount
    ) {
      throw new Error("Invalid admissibility segment");
    }
    offset += 20;
    let rawCode = view.getUint32(offset, true);
    offset += 4;
    const packedSize = Math.ceil((count - 1) * bits / 8);
    if (offset + packedSize > buffer.byteLength || rawCode <= previousRawCode) {
      throw new Error("Invalid admissibility checkpoints");
    }
    const segmentCheckpointOffset = checkpointOffset;
    checkpoints[checkpointOffset] = rawCode;
    checkpointOffset += 1;
    let bitOffset = 0;
    for (let index = 1; index < count; index += 1) {
      let excess = 0;
      for (let bit = 0; bit < bits; bit += 1) {
        excess += (
          (bytes[offset + Math.floor(bitOffset / 8)] >> (bitOffset % 8)) & 1
        ) * (2 ** bit);
        bitOffset += 1;
      }
      rawCode += stride + baseline + excess;
      const rank = startRank + index * stride;
      if (rawCode > UINT32_MAXIMUM || rank > maximumRank) {
        throw new Error("Invalid admissibility checkpoints");
      }
      checkpoints[checkpointOffset] = rawCode;
      checkpointOffset += 1;
    }
    offset += packedSize;
    previousCheckpointRank = startRank + (count - 1) * stride;
    previousRawCode = rawCode;
    segments.push(Object.freeze({
      startRank,
      stride,
      checkpointOffset: segmentCheckpointOffset,
      checkpointCount: count,
    }));
  }
  if (
    offset !== buffer.byteLength || checkpointOffset !== checkpointCount ||
    checkpoints[0] !== 0
  ) {
    throw new Error("Invalid admissibility data size");
  }
  return Object.freeze({
    maximumRank,
    segments: Object.freeze(segments),
    checkpoints,
  });
}

async function fetchData(filename, decode) {
  const response = await fetch(`./data/${filename}`);
  if (!response.ok) {
    throw new Error(`Could not fetch ./data/${filename}`);
  }
  return decode(await response.arrayBuffer());
}

let primeIndexPromise;
const admissiblePromises = new Map();

export function loadPrimeIndex() {
  primeIndexPromise ??= fetchData("indexes/prime_index.bin", decodePrimeIndexData);
  return primeIndexPromise;
}

export function loadAdmissibleData(name) {
  let promise = admissiblePromises.get(name);
  if (promise === undefined) {
    promise = fetchData(`indexes/${name}_admissible.bin`, decodeAdmissibleData);
    admissiblePromises.set(name, promise);
  }
  return promise;
}

export function admissibleUnrank(rank, data, rawDecode, isAdmissible) {
  assertIntegerInRange(rank, 1, data.maximumRank, "admissible rank");
  let segmentIndex = data.segments.length - 1;
  while (data.segments[segmentIndex].startRank > rank) {
    segmentIndex -= 1;
  }
  const segment = data.segments[segmentIndex];
  const localIndex = Math.min(
    Math.floor((rank - segment.startRank) / segment.stride),
    segment.checkpointCount - 1,
  );
  const checkpointIndex = segment.checkpointOffset + localIndex;
  const checkpointRank = segment.startRank + localIndex * segment.stride;
  if (checkpointRank === rank) {
    return rawDecode(data.checkpoints[checkpointIndex]);
  }
  let remaining = rank - checkpointRank;
  let rawCode = data.checkpoints[checkpointIndex] + 1;
  for (;;) {
    const candidate = rawDecode(rawCode);
    if (isAdmissible(candidate)) {
      remaining -= 1;
      if (remaining === 0) {
        return candidate;
      }
    }
    rawCode += 1;
  }
}

export function admissibleRank(value, data, rawCode, rawDecode, isAdmissible) {
  const targetCode = rawCode(value);
  if (targetCode === null) {
    return null;
  }

  let low = 0;
  let high = data.checkpoints.length;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (data.checkpoints[middle] <= targetCode) {
      low = middle;
    } else {
      high = middle;
    }
  }

  let segmentIndex = data.segments.length - 1;
  while (data.segments[segmentIndex].checkpointOffset > low) {
    segmentIndex -= 1;
  }
  const segment = data.segments[segmentIndex];
  let rank = segment.startRank + (low - segment.checkpointOffset) * segment.stride;
  let candidateCode = data.checkpoints[low];
  if (candidateCode === targetCode) {
    return rank === 0 ? null : rank;
  }
  while (candidateCode < targetCode) {
    if (rank === data.maximumRank) {
      return null;
    }
    candidateCode += 1;
    if (isAdmissible(rawDecode(candidateCode))) {
      rank += 1;
    }
  }
  return isAdmissible(value) ? rank : null;
}
