import {availableParallelism} from "node:os";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {isMainThread, parentPort, workerData, Worker} from "node:worker_threads";

import {decodePrimeIndexData} from "./docs/natural_number_encoding.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = path.join(ROOT, "_admissibility");
const ENCODER_NAMES = new Set(["buchholz_1", "buchholz", "ebocf"]);
const ARTIFACT_MAGIC = "ADC1";
const ARTIFACT_HEADER_SIZE = 28;
const BUNDLE_MAGIC = "ADM1";
const BUNDLE_HEADER_SIZE = 16;
const SEGMENT_HEADER_SIZE = 16;
const BASE_STRIDE = 50;
const DENSE_STRIDE = 100;
const SPARSE_STRIDE = 500;
const RAW_CHUNK_SIZE = 100_000;
const FACTORIZATION_SEGMENT_SIZE = 10_000;

function requireInteger(value, minimum, name) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be an integer at least ${minimum}`);
  }
}

function readArrayBuffer(filename) {
  const bytes = fs.readFileSync(filename);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function readMagic(bytes, offset = 0) {
  return String.fromCharCode(...bytes.subarray(offset, offset + 4));
}

function writeMagic(bytes, magic, offset = 0) {
  for (let index = 0; index < magic.length; index += 1) {
    bytes[offset + index] = magic.charCodeAt(index);
  }
}

function bitWidth(value) {
  requireInteger(value, 0, "bit-packed value");
  let width = 0;
  while (value > 0) {
    width += 1;
    value = Math.floor(value / 2);
  }
  return width;
}

function maximum(values) {
  let result = 0;
  for (const value of values) {
    result = Math.max(result, value);
  }
  return result;
}

function packValues(values, bits) {
  const output = new Uint8Array(Math.ceil(values.length * bits / 8));
  let bitOffset = 0;
  for (const value of values) {
    requireInteger(value, 0, "bit-packed value");
    if (bitWidth(value) > bits) {
      throw new RangeError("value exceeds packed bit width");
    }
    for (let bit = 0; bit < bits; bit += 1) {
      if (Math.floor(value / (2 ** bit)) % 2 === 1) {
        output[Math.floor(bitOffset / 8)] |= 1 << (bitOffset % 8);
      }
      bitOffset += 1;
    }
  }
  return output;
}

function unpackValues(bytes, count, bits) {
  if (bytes.byteLength !== Math.ceil(count * bits / 8)) {
    throw new Error("invalid bit-packed payload size");
  }
  const values = new Uint32Array(count);
  let bitOffset = 0;
  for (let index = 0; index < count; index += 1) {
    let value = 0;
    for (let bit = 0; bit < bits; bit += 1) {
      value += ((bytes[Math.floor(bitOffset / 8)] >> (bitOffset % 8)) & 1) * (2 ** bit);
      bitOffset += 1;
    }
    values[index] = value;
  }
  return values;
}

function factorizeRange(primeIndex, rawStart, rawCount) {
  requireInteger(rawStart, 1, "factorization range start");
  requireInteger(rawCount, 1, "factorization range size");
  if (rawStart + rawCount - 1 > primeIndex.maximum) {
    throw new RangeError("factorization range exceeds the prime index maximum");
  }
  const remaining = new Uint32Array(rawCount);
  const factors = Array.from({length: rawCount}, () => []);
  for (let offset = 0; offset < rawCount; offset += 1) {
    remaining[offset] = rawStart + offset;
  }
  const rawEnd = rawStart + rawCount;
  for (const prime of primeIndex.basePrimes) {
    if (prime * prime >= rawEnd) {
      break;
    }
    for (
      let rawCode = Math.ceil(rawStart / prime) * prime;
      rawCode < rawEnd;
      rawCode += prime
    ) {
      const offset = rawCode - rawStart;
      let exponent = 0;
      while (remaining[offset] % prime === 0) {
        remaining[offset] /= prime;
        exponent += 1;
      }
      if (exponent > 0) {
        factors[offset].push([prime, exponent]);
      }
    }
  }
  for (let offset = 0; offset < rawCount; offset += 1) {
    if (remaining[offset] > 1) {
      factors[offset].push([remaining[offset], 1]);
    }
  }
  return factors;
}

function artifactFilename(name, rawStart) {
  const chunkIndex = (rawStart - 1) / RAW_CHUNK_SIZE;
  requireInteger(chunkIndex, 0, "artifact chunk index");
  return path.join(ARTIFACTS, `${name}.${String(chunkIndex).padStart(5, "0")}.bin`);
}

function encodeArtifact({rawStart, rawCount, rankStart, accepted, bitset}) {
  const rankEnd = rankStart + accepted;
  const firstRank = Math.ceil((rankStart + 1) / BASE_STRIDE) * BASE_STRIDE;
  const checkpointCount = firstRank > rankEnd
    ? 0
    : Math.floor((rankEnd - firstRank) / BASE_STRIDE) + 1;
  const offsets = [];
  let rank = rankStart;
  let nextCheckpointRank = firstRank;
  for (let offset = 0; offset < rawCount; offset += 1) {
    if ((bitset[Math.floor(offset / 8)] & (1 << (offset % 8))) === 0) {
      continue;
    }
    rank += 1;
    if (rank === nextCheckpointRank) {
      offsets.push(offset);
      nextCheckpointRank += BASE_STRIDE;
    }
  }
  if (rank !== rankEnd || offsets.length !== checkpointCount) {
    throw new Error("admissibility chunk count mismatch");
  }
  const bits = bitWidth(maximum(offsets));
  const packed = packValues(offsets, bits);
  const output = new Uint8Array(ARTIFACT_HEADER_SIZE + packed.byteLength);
  const view = new DataView(output.buffer);
  writeMagic(output, ARTIFACT_MAGIC);
  view.setUint32(4, rawStart, true);
  view.setUint32(8, rawCount, true);
  view.setUint32(12, rankStart, true);
  view.setUint32(16, rankEnd, true);
  view.setUint32(20, checkpointCount, true);
  view.setUint8(24, bits);
  output.set(packed, ARTIFACT_HEADER_SIZE);
  return {
    bytes: output,
    artifact: {
      rawStart,
      rawCount,
      rankStart,
      rankEnd,
      firstRank,
      checkpoints: offsets.map((offset) => rawStart + offset),
    },
  };
}

function decodeArtifact(filename) {
  const bytes = new Uint8Array(readArrayBuffer(filename));
  if (
    bytes.byteLength < ARTIFACT_HEADER_SIZE ||
    readMagic(bytes) !== ARTIFACT_MAGIC
  ) {
    throw new Error(`invalid admissibility artifact: ${filename}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rawStart = view.getUint32(4, true);
  const rawCount = view.getUint32(8, true);
  const rankStart = view.getUint32(12, true);
  const rankEnd = view.getUint32(16, true);
  const checkpointCount = view.getUint32(20, true);
  const bits = view.getUint8(24);
  if (
    rawStart < 1 || rawCount !== RAW_CHUNK_SIZE ||
    rankEnd < rankStart || rankEnd - rankStart > rawCount || bits > 32
  ) {
    throw new Error(`invalid admissibility artifact header: ${filename}`);
  }
  const expectedFirstRank = Math.ceil((rankStart + 1) / BASE_STRIDE) * BASE_STRIDE;
  const expectedCount = expectedFirstRank > rankEnd
    ? 0
    : Math.floor((rankEnd - expectedFirstRank) / BASE_STRIDE) + 1;
  if (checkpointCount !== expectedCount) {
    throw new Error(`invalid admissibility artifact ranks: ${filename}`);
  }
  const offsets = unpackValues(bytes.subarray(ARTIFACT_HEADER_SIZE), checkpointCount, bits);
  let previous = -1;
  for (const offset of offsets) {
    if (offset <= previous || offset >= rawCount) {
      throw new Error(`invalid admissibility artifact offsets: ${filename}`);
    }
    previous = offset;
  }
  return {
    rawStart,
    rawCount,
    rankStart,
    rankEnd,
    firstRank: expectedFirstRank,
    checkpoints: Array.from(offsets, (offset) => rawStart + offset),
  };
}

function writeAtomic(filename, bytes) {
  fs.mkdirSync(path.dirname(filename), {recursive: true});
  const temporary = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes);
  fs.renameSync(temporary, filename);
}

function loadArtifacts(name) {
  fs.mkdirSync(ARTIFACTS, {recursive: true});
  const filenames = fs.readdirSync(ARTIFACTS)
    .filter((filename) => filename.startsWith(`${name}.`) && filename.endsWith(".bin"))
    .sort()
    .map((filename) => path.join(ARTIFACTS, filename));
  const artifacts = [];
  let expectedRawStart = 1;
  let expectedRankStart = 0;
  for (const filename of filenames) {
    const artifact = decodeArtifact(filename);
    if (artifact.rawStart !== expectedRawStart || artifact.rankStart !== expectedRankStart) {
      throw new Error(`noncontiguous admissibility artifact: ${filename}`);
    }
    artifacts.push(artifact);
    expectedRawStart += artifact.rawCount;
    expectedRankStart = artifact.rankEnd;
  }
  return artifacts;
}

function checkpointsFromArtifacts(artifacts, maximumRank) {
  const checkpoints = new Map([[0, 0]]);
  for (const artifact of artifacts) {
    for (let index = 0; index < artifact.checkpoints.length; index += 1) {
      const rank = artifact.firstRank + index * BASE_STRIDE;
      if (rank <= maximumRank) {
        checkpoints.set(rank, artifact.checkpoints[index]);
      }
    }
  }
  return checkpoints;
}

function makeSegments(maximumRank, denseMaximumRank) {
  const boundary = Math.ceil(denseMaximumRank / SPARSE_STRIDE) * SPARSE_STRIDE;
  if (boundary > maximumRank) {
    return [{startRank: 0, stride: DENSE_STRIDE}];
  }
  return [
    {startRank: 0, stride: DENSE_STRIDE},
    {startRank: boundary, stride: SPARSE_STRIDE},
  ];
}

function encodeBundle(maximumRank, segmentSpecs, baseCheckpoints) {
  const segments = segmentSpecs.map((spec, index) => {
    const endRank = index + 1 < segmentSpecs.length
      ? segmentSpecs[index + 1].startRank - 1
      : maximumRank;
    const checkpointCount = Math.floor((endRank - spec.startRank) / spec.stride) + 1;
    const checkpoints = Array.from({length: checkpointCount}, (_unused, checkpointIndex) => {
      const rank = spec.startRank + checkpointIndex * spec.stride;
      const rawCode = baseCheckpoints.get(rank);
      if (rawCode === undefined) {
        throw new Error(`missing base checkpoint at rank ${rank}`);
      }
      return rawCode;
    });
    const excesses = checkpoints.slice(1).map(
      (rawCode, checkpointIndex) => rawCode - checkpoints[checkpointIndex] - spec.stride,
    );
    const bits = bitWidth(maximum(excesses));
    return {...spec, checkpoints, excesses, bits};
  });
  const totalCheckpoints = segments.reduce(
    (total, segment) => total + segment.checkpoints.length,
    0,
  );
  const payloadSize = BUNDLE_HEADER_SIZE + segments.reduce(
    (total, segment) => (
      total + SEGMENT_HEADER_SIZE + 4 +
      Math.ceil(segment.excesses.length * segment.bits / 8)
    ),
    0,
  );
  const output = new Uint8Array(payloadSize);
  const view = new DataView(output.buffer);
  writeMagic(output, BUNDLE_MAGIC);
  view.setUint32(4, maximumRank, true);
  view.setUint32(8, segments.length, true);
  view.setUint32(12, totalCheckpoints, true);
  let offset = BUNDLE_HEADER_SIZE;
  for (const segment of segments) {
    view.setUint32(offset, segment.startRank, true);
    view.setUint32(offset + 4, segment.stride, true);
    view.setUint32(offset + 8, segment.checkpoints.length, true);
    view.setUint8(offset + 12, segment.bits);
    offset += SEGMENT_HEADER_SIZE;
    view.setUint32(offset, segment.checkpoints[0], true);
    offset += 4;
    const packed = packValues(segment.excesses, segment.bits);
    output.set(packed, offset);
    offset += packed.byteLength;
  }
  if (offset !== output.byteLength) {
    throw new Error("admissibility bundle size mismatch");
  }
  return {bytes: output, segments};
}

async function scanChunk(primeIndex, name, rawStart, rawCount, scannerCache) {
  let scanner = scannerCache.get(name);
  if (scanner === undefined) {
    const notationPath = path.join(ROOT, "docs", "notations", `${name}.js`);
    const notation = await import(pathToFileURL(notationPath));
    scanner = notation.createAdmissibilityScanner(primeIndex);
    scannerCache.set(name, scanner);
  }
  const bitset = new Uint8Array(Math.ceil(rawCount / 8));
  let accepted = 0;
  const rawEnd = rawStart + rawCount;
  for (
    let segmentStart = rawStart;
    segmentStart < rawEnd;
    segmentStart += FACTORIZATION_SEGMENT_SIZE
  ) {
    const segmentEnd = Math.min(segmentStart + FACTORIZATION_SEGMENT_SIZE, rawEnd);
    const segmentFactors = factorizeRange(primeIndex, segmentStart, segmentEnd - segmentStart);
    for (let rawCode = segmentStart; rawCode < segmentEnd; rawCode += 1) {
      const factors = segmentFactors[rawCode - segmentStart];
      if (scanner.isAdmissible(scanner.rawDecode(rawCode, factors))) {
        const offset = rawCode - rawStart;
        bitset[Math.floor(offset / 8)] |= 1 << (offset % 8);
        accepted += 1;
      }
    }
  }
  return {rawStart, rawCount, accepted, bitset};
}

async function workerMain() {
  const primeIndex = decodePrimeIndexData(readArrayBuffer(workerData.primeIndexPath));
  const scannerCache = new Map();
  parentPort.postMessage({ready: true});
  parentPort.on("message", async ({id, name, rawStart, rawCount}) => {
    try {
      const result = await scanChunk(
        primeIndex,
        name,
        rawStart,
        rawCount,
        scannerCache,
      );
      parentPort.postMessage({id, ...result}, [result.bitset.buffer]);
    } catch (error) {
      parentPort.postMessage({id, error: error.stack ?? String(error)});
    }
  });
}

class WorkerPool {
  constructor(size, primeIndexPath) {
    this.idle = [];
    this.pending = [];
    this.tasks = new Map();
    this.nextId = 1;
    this.failure = null;
    this.closing = false;
    this.workers = Array.from({length: size}, () => {
      const worker = new Worker(new URL(import.meta.url), {workerData: {primeIndexPath}});
      worker.on("message", (message) => this.#message(worker, message));
      worker.on("error", (error) => this.#fail(error));
      worker.on("exit", (code) => {
        if (!this.closing) {
          this.#fail(new Error(`admissibility worker exited with code ${code}`));
        }
      });
      return worker;
    });
  }

  #message(worker, message) {
    if (this.failure !== null) {
      return;
    }
    if (message.ready) {
      this.idle.push(worker);
      this.#dispatch();
      return;
    }
    const task = this.tasks.get(message.id);
    if (message.error) {
      this.#fail(new Error(message.error));
      return;
    }
    this.tasks.delete(message.id);
    this.idle.push(worker);
    task.resolve(message);
    this.#dispatch();
  }

  #fail(error) {
    if (this.failure !== null) {
      return;
    }
    this.failure = error;
    for (const task of this.tasks.values()) {
      task.reject(error);
    }
    this.tasks.clear();
    for (const task of this.pending) {
      task.reject(error);
    }
    this.pending = [];
  }

  #dispatch() {
    while (this.idle.length > 0 && this.pending.length > 0) {
      const worker = this.idle.pop();
      const task = this.pending.shift();
      this.tasks.set(task.message.id, task);
      worker.postMessage(task.message);
    }
  }

  run(message) {
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    return new Promise((resolve, reject) => {
      this.pending.push({message: {...message, id: this.nextId++}, resolve, reject});
      this.#dispatch();
    });
  }

  async close() {
    this.closing = true;
    await Promise.all(this.workers.map((worker) => worker.terminate()));
  }
}

async function extendArtifacts(pool, name, maximumRank) {
  const artifacts = loadArtifacts(name);
  let rawEnd = artifacts.reduce((end, artifact) => end + artifact.rawCount, 1);
  let rankEnd = artifacts.length === 0 ? 0 : artifacts.at(-1).rankEnd;
  if (rankEnd >= maximumRank) {
    console.log(`${name}: reused ${rawEnd - 1} raw codes (${rankEnd} admissible)`);
    return artifacts;
  }

  const started = performance.now();
  const initialRawEnd = rawEnd;
  let scheduledRawStart = rawEnd;
  const active = new Set();
  const completed = new Map();
  let lastProgress = started;

  const schedule = () => {
    const rawStart = scheduledRawStart;
    scheduledRawStart += RAW_CHUNK_SIZE;
    const promise = pool.run({name, rawStart, rawCount: RAW_CHUNK_SIZE})
      .then((result) => completed.set(rawStart, result))
      .finally(() => active.delete(promise));
    active.add(promise);
  };
  const fill = () => {
    while (active.size < pool.workers.length) {
      schedule();
    }
  };
  fill();

  while (rankEnd < maximumRank) {
    await Promise.race(active);
    while (completed.has(rawEnd)) {
      const result = completed.get(rawEnd);
      completed.delete(rawEnd);
      const encoded = encodeArtifact({
        rawStart: result.rawStart,
        rawCount: result.rawCount,
        rankStart: rankEnd,
        accepted: result.accepted,
        bitset: result.bitset,
      });
      const filename = artifactFilename(name, result.rawStart);
      writeAtomic(filename, encoded.bytes);
      const artifact = encoded.artifact;
      artifacts.push(artifact);
      rankEnd = artifact.rankEnd;
      rawEnd += artifact.rawCount;
      const now = performance.now();
      if (now - lastProgress >= 2000) {
        const elapsed = (now - started) / 1000;
        const rate = Math.round((rawEnd - initialRawEnd) / elapsed);
        console.log(
          `${name}: ${rankEnd.toLocaleString()} admissible, ` +
          `${(rawEnd - 1).toLocaleString()} raw, ${rate.toLocaleString()}/s`,
        );
        lastProgress = now;
      }
      if (rankEnd >= maximumRank) {
        break;
      }
    }
    if (rankEnd < maximumRank) {
      fill();
    }
  }
  await Promise.allSettled(active);
  const elapsed = (performance.now() - started) / 1000;
  const rate = Math.round((rawEnd - initialRawEnd) / elapsed);
  console.log(
    `${name}: completed in ${elapsed.toFixed(2)}s at ${rate.toLocaleString()} raw/s`,
  );
  return artifacts;
}

function parseArguments([primeIndexPath, outputDirectory, workerArgument, ...names]) {
  const requestedWorkers = Number(workerArgument);
  if (!primeIndexPath || !outputDirectory) {
    throw new Error(
      "usage: generate_admissibility_data.js PRIME_INDEX OUTPUT_DIRECTORY WORKERS ENCODER...",
    );
  }
  requireInteger(requestedWorkers, 0, "worker count");
  if (names.length === 0 || names.some((name) => !ENCODER_NAMES.has(name))) {
    throw new Error("no encoders selected");
  }
  return {
    primeIndexPath,
    outputDirectory,
    workers: requestedWorkers || availableParallelism(),
    names,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const primeIndex = decodePrimeIndexData(readArrayBuffer(options.primeIndexPath));
  const denseMaximum = Math.max(2, Math.floor(primeIndex.maximum / 10));
  const denseMaximumRank = denseMaximum === primeIndex.maximum
    ? primeIndex.maximumRank
    : primeIndex.primeIndex(primeIndex.previousPrime(denseMaximum + 1));
  const workerCount = Math.min(options.workers, availableParallelism());
  console.log(
    `admissibility: ${workerCount} workers, ` +
    `dense through ${denseMaximum.toLocaleString()}`,
  );
  const pool = new WorkerPool(workerCount, options.primeIndexPath);
  try {
    for (const name of options.names) {
      const artifacts = await extendArtifacts(
        pool,
        name,
        primeIndex.maximumRank,
      );
      const checkpoints = checkpointsFromArtifacts(artifacts, primeIndex.maximumRank);
      const specs = makeSegments(primeIndex.maximumRank, denseMaximumRank);
      const bundle = encodeBundle(primeIndex.maximumRank, specs, checkpoints);
      const output = path.join(options.outputDirectory, `${name}_admissible.bin`);
      writeAtomic(output, bundle.bytes);
      const description = bundle.segments.map(
        (segment) => (
          `stride ${segment.stride} × ${segment.checkpoints.length.toLocaleString()}`
        ),
      ).join(", ");
      console.log(
        `${name}: ${bundle.bytes.byteLength.toLocaleString()} bytes; ${description}`,
      );
    }
  } finally {
    await pool.close();
  }
}

if (isMainThread) {
  main().catch((error) => {
    console.error(error.stack ?? String(error));
    process.exitCode = 1;
  });
} else {
  await workerMain();
}
