const HEADER_SIZE = 16, CACHE_LIMIT = 2000;

export function cacheIntegerValue(cache, key, value) {
  if (cache.size >= CACHE_LIMIT && !cache.has(key)) cache.delete(cache.keys().next().value);
  cache.set(key, value);
  return value;
}

export function boundedMultiplyPower(product, base, exponent, maximum) {
  let result = product, factor = base, remaining = exponent;
  while (remaining > 0) {
    if (remaining % 2 === 1) {
      if (result > Math.floor(maximum / factor)) return null;
      result *= factor;
    }
    remaining = Math.floor(remaining / 2);
    if (remaining > 0) {
      if (factor > Math.floor(maximum / factor)) return null;
      factor *= factor;
    }
  }
  return result;
}

export function boundedPrimePowerProduct(product, index, exponent, primeIndex) {
  if (product === null || !Number.isSafeInteger(index) || index < 1 || index > primeIndex.maximumRank) return null;
  return boundedMultiplyPower(product, primeIndex.primeAtIndex(index), exponent, primeIndex.maximum);
}

export class PrimeIndex {
  constructor(maximum, blockSize, counts) {
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
      if (!prime[p]) continue;
      for (let multiple = p * p; multiple <= limit; multiple += p) { prime[multiple] = 0; }
    }
    const result = [];
    for (let p = 2; p <= limit; p += 1) { if (prime[p]) result.push(p); }
    return result;
  }

  #block(blockIndex) {
    const cached = this.blockCache.get(blockIndex);
    if (cached !== undefined) return cached;
    const start = blockIndex * this.blockSize, end = Math.min(this.maximum + 1, start + this.blockSize);
    const prime = new Uint8Array(end - start);
    prime.fill(1);
    for (const p of this.basePrimes) {
      if (p * p >= end) break;
      const first = Math.max(p * p, Math.ceil(start / p) * p);
      for (let multiple = first; multiple < end; multiple += p) { prime[multiple - start] = 0; }
    }
    for (let value = start; value < Math.min(end, 2); value += 1) { prime[value - start] = 0; }
    const primes = [];
    for (let offset = 0; offset < prime.length; offset += 1) { if (prime[offset]) primes.push(start + offset); }
    if (this.blockCache.size >= 256) this.blockCache.delete(this.blockCache.keys().next().value);
    this.blockCache.set(blockIndex, primes);
    return primes;
  }

  #lowerBound(values, target) {
    let low = 0, high = values.length;
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
    const cached = this.factorCache.get(n);
    if (cached !== undefined) return cached;
    const factors = [];
    let remainder = n;
    for (const p of this.basePrimes) {
      if (p * p > remainder) break;
      if (remainder % p !== 0) continue;
      let exponent = 0;
      do {
        remainder /= p;
        exponent += 1;
      } while (remainder % p === 0);
      factors.push(Object.freeze([p, exponent]));
    }
    if (remainder > 1) factors.push(Object.freeze([remainder, 1]));
    return cacheIntegerValue(this.factorCache, n, Object.freeze(factors));
  }

  primeIndex(prime) {
    const cached = this.primeIndexCache.get(prime);
    if (cached !== undefined) return cached;
    const blockIndex = Math.floor(prime / this.blockSize), primes = this.#block(blockIndex);
    const low = this.#lowerBound(primes, prime), index = this.counts[blockIndex] + low + 1;
    cacheIntegerValue(this.primeAtIndexCache, index, prime);
    return cacheIntegerValue(this.primeIndexCache, prime, index);
  }

  primeAtIndex(index) {
    const cached = this.primeAtIndexCache.get(index);
    if (cached !== undefined) return cached;
    let low = 0, high = this.counts.length - 1;
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
    let blockIndex = Math.floor(n / this.blockSize);
    while (blockIndex >= 0) {
      const primes = this.#block(blockIndex), low = this.#lowerBound(primes, n);
      if (low > 0) return primes[low - 1];
      blockIndex -= 1;
    }
    return null;
  }

  nextPrime(n) {
    const blockCount = this.counts.length - 1;
    let blockIndex = Math.floor(n / this.blockSize);
    while (blockIndex < blockCount) {
      const primes = this.#block(blockIndex), low = this.#lowerBound(primes, n + 1);
      if (low < primes.length) return primes[low];
      blockIndex += 1;
    }
    return null;
  }
}

export function createSievedPrimeIndex(maximum, blockSize = 32768) {
  const prime = new Uint8Array(maximum + 1);
  prime.fill(1, 2);
  for (let p = 2; p * p <= maximum; p += 1) {
    if (!prime[p]) continue;
    for (let multiple = p * p; multiple <= maximum; multiple += p) { prime[multiple] = 0; }
  }

  const blockCount = Math.floor(maximum / blockSize) + 1, counts = new Uint32Array(blockCount + 1);
  for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
    const start = blockIndex * blockSize, end = Math.min(maximum + 1, start + blockSize);
    let count = counts[blockIndex];
    for (let value = start; value < end; value += 1) { count += prime[value]; }
    counts[blockIndex + 1] = count;
  }
  return new PrimeIndex(maximum, blockSize, counts);
}

export function decodePrimeIndexData(buffer) {
  const view = new DataView(buffer), maximum = view.getUint32(4, true);
  const blockSize = view.getUint32(8, true), count = view.getUint32(12, true);
  const counts = new Uint32Array(count);
  for (let index = 1; index < count; index += 1) {
    counts[index] = counts[index - 1] + view.getUint16(HEADER_SIZE + 2 * (index - 1), true);
  }
  return new PrimeIndex(maximum, blockSize, counts);
}

export function decodeAdmissibleData(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const maximumRank = view.getUint32(4, true), segmentCount = view.getUint32(8, true);
  const checkpointCount = view.getUint32(12, true);

  const checkpoints = new Uint32Array(checkpointCount), segments = [];
  let offset = HEADER_SIZE, checkpointOffset = 0;
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const startRank = view.getUint32(offset, true), stride = view.getUint32(offset + 4, true);
    const count = view.getUint32(offset + 8, true), bits = view.getUint8(offset + 12);
    const baseline = view.getUint32(offset + 16, true);
    offset += 20;
    let rawCode = view.getUint32(offset, true);
    offset += 4;
    const packedSize = Math.ceil((count - 1) * bits / 8), segmentCheckpointOffset = checkpointOffset;
    checkpoints[checkpointOffset] = rawCode;
    checkpointOffset += 1;
    for (let index = 1; index < count; index += 1) {
      const bitOffset = (index - 1) * bits;
      let excess;
      if (bits <= 16) {
        // Three bytes cover a 16-bit value at any bit alignment.
        const byteOffset = offset + Math.floor(bitOffset / 8);
        const word = bytes[byteOffset] |
          ((bytes[byteOffset + 1] ?? 0) << 8) |
          ((bytes[byteOffset + 2] ?? 0) << 16);
        excess = (word >>> (bitOffset % 8)) & ((1 << bits) - 1);
      } else {
        excess = 0;
        for (let bit = 0; bit < bits; bit += 1) {
          const packedBit = bitOffset + bit;
          excess += ((bytes[offset + Math.floor(packedBit / 8)] >> (packedBit % 8)) & 1) * (2 ** bit);
        }
      }
      rawCode += stride + baseline + excess;
      checkpoints[checkpointOffset] = rawCode;
      checkpointOffset += 1;
    }
    offset += packedSize;
    segments.push(Object.freeze({
      startRank,
      stride,
      checkpointOffset: segmentCheckpointOffset,
    }));
  }
  return Object.freeze({maximumRank, segments: Object.freeze(segments), checkpoints});
}

export async function fetchData(filename, decode) {
  const response = await fetch(`./data/${filename}`);
  if (!response.ok) throw new Error(`Could not fetch ./data/${filename}`);
  const stream = response.body.pipeThrough(new DecompressionStream("gzip"));
  return decode(await new Response(stream).arrayBuffer());
}

export function loadPrimeIndex() {
  return fetchData("indexes/prime_index.bin.gz", decodePrimeIndexData);
}

export function loadAdmissibleData(name) {
  return fetchData(`indexes/${name}_admissible.bin.gz`, decodeAdmissibleData);
}

export function createAdmissibleIndex(data, primeIndex, rawDecode, isAdmissible) {
  const {segments, checkpoints} = data;
  let last = {rank: 0, code: 0};

  function floorByRank(rank) {
    const segment = segments.findLast((segment) => segment.startRank <= rank);
    const offset = Math.floor((rank - segment.startRank) / segment.stride);
    return Math.min(segment.checkpointOffset + offset, checkpoints.length - 1);
  }

  function floorByCode(code, end) {
    let low = 0, high = end + 1;
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (checkpoints[middle] <= code) low = middle;
      else high = middle;
    }
    return low;
  }

  // Checkpoints accelerate the search. The prime index determines the domain.
  const coveredRank = Math.min(data.maximumRank, primeIndex.maximumRank);
  const end = floorByCode(primeIndex.maximum, floorByRank(coveredRank));

  function checkpoint(index) {
    const segment = segments.findLast((segment) => segment.checkpointOffset <= index);
    return {
      rank: segment.startRank + (index - segment.checkpointOffset) * segment.stride,
      code: checkpoints[index],
    };
  }

  // Consecutive primes have consecutive ranks. The previous result is often closer
  // than either stored checkpoint, in both the rank and raw-code directions.
  function nearest(target, field, index) {
    let best = checkpoint(index);
    if (best[field] === target) return best;
    if (index < end) {
      const upper = checkpoint(index + 1);
      if (upper[field] - target < target - best[field]) best = upper;
    }
    return Math.abs(last[field] - target) < Math.abs(best[field] - target) ? last : best;
  }

  function unrank(target) {
    const index = Math.min(floorByRank(target), end);
    let {rank, code} = nearest(target, "rank", index);
    const step = Math.sign(target - rank);
    let value;
    while (rank !== target) {
      code += step;
      value = rawDecode(code);
      if (isAdmissible(value)) rank += step;
    }
    last = {rank, code};
    return value ?? rawDecode(code);
  }

  // The enclosing legal psi term guarantees that its argument is admissible.
  function rankOfAdmissible(target) {
    if (target === null) return null;
    let {rank, code} = nearest(target, "code", floorByCode(target, end));
    const step = Math.sign(target - code);
    while (code !== target) {
      if (step > 0 && rank === primeIndex.maximumRank) return null;
      code += step;
      if (code === target || isAdmissible(rawDecode(code))) rank += step;
    }
    last = {rank, code};
    return rank;
  }

  return {unrank, rankOfAdmissible};
}
