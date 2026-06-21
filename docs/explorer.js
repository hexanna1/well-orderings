import * as cantor from "./notations/cantor.js";
import * as binary from "./notations/binary.js";
import * as finitary from "./notations/finitary.js";
import * as transfinitary from "./notations/transfinitary.js";
import * as buchholz1 from "./notations/buchholz_1.js";
import * as buchholz from "./notations/buchholz.js";
import * as ebocf from "./notations/ebocf.js";
import {
  applyPageMetadata,
  encoderPageTitle,
  encodersByName,
  populateEncoderNav,
} from "./encoders.js";
import { loadAdmissibleData, loadPrimeIndex } from "./natural_number_encoding.js";

await window.katexReady;

const buttonCount = 6;
const previewTermLimit = 256;
const previewBraceDepthLimit = 100;
const mobilePreviewRecursionDepthLimit = 256;
const coarsePointerDevice = (
  typeof window.matchMedia === "function" &&
  window.matchMedia("(hover: none) and (pointer: coarse)").matches
);
const mobilePreviewSafetyEnabled = coarsePointerDevice;
const collapsingNames = ["buchholz_1", "buchholz", "ebocf"];

function rootApproximants(initialValue, nextValue, renderValue = (value) => value) {
  const result = [];
  let value = initialValue;
  for (let index = 0; index < buttonCount; index += 1) {
    result.push(renderValue(value));
    value = nextValue(value);
  }
  return result;
}

const explorerEntries = [
  {
    name: "cantor",
    rootLatex: "\\varepsilon_{0}",
    api: cantor,
    examples: ["4221", "4333333", "5222211122121"],
    rootChildren: () => rootApproximants(cantor.zero, (value) => cantor.omegaPower(value)),
  },
  {
    name: "binary",
    rootLatex: "\\Gamma_{0}",
    api: binary,
    examples: ["322211", "323312121", "333211202121"],
    rootChildren: () => rootApproximants(binary.zero, (value) => binary.phi(value, binary.zero)),
  },
  {
    name: "finitary",
    rootLatex: "\\mathrm{SVO}",
    api: finitary,
    examples: ["332222121121", "332222232212011", "433123221212322211212013222212102001"],
    rootChildren: () => Array.from(
      { length: buttonCount },
      (_, index) => finitary.veblen(
        ...Array.from({ length: index }, () => finitary.zero),
        finitary.one,
      ),
    ),
  },
  {
    name: "transfinitary",
    rootLatex: "\\mathrm{LVO}",
    api: transfinitary,
    examples: ["31322130212", "3132213132211201", "333222212103023222102022"],
    rootChildren: () => rootApproximants(
      transfinitary.zero,
      (value) => transfinitary.principal([[value, transfinitary.one]]),
    ),
  },
  {
    name: "buchholz_1",
    rootLatex: "\\mathrm{BHO}",
    api: buchholz1,
    examples: [
      "202020211",
      "22111022111",
      "312020202010011010002210021002020200000202010011010001",
    ],
    rootChildren: () => rootApproximants(
      buchholz1.psi1(buchholz1.zero),
      (argument) => buchholz1.psi1(argument),
      (argument) => buchholz1.psi0(argument),
    ),
  },
  {
    name: "buchholz",
    rootLatex: "\\mathrm{BO}",
    api: buchholz,
    examples: ["31101", "4110020100", "421100000000020"],
    rootChildren: () => Array.from(
      { length: buttonCount },
      (_, index) => buchholz.psi(0, buchholz.omegaLevel(index)),
    ),
  },
  {
    name: "ebocf",
    rootLatex: "\\psi_{0}(\\Lambda)",
    api: ebocf,
    examples: [
      "32031002101",
      "321221131100001",
      "5101031110020020012000002000001020000000020000000011000000000002000000000100000000000200000000001000000000002000000000002",
    ],
    rootChildren: () => rootApproximants(
      ebocf.zero,
      (level) => ebocf.psi(level, ebocf.zero),
      (level) => ebocf.psi(ebocf.zero, level),
    ),
  },
];
const encoderEntries = explorerEntries.map((entry) => ({
  ...encodersByName[entry.name],
  ...entry,
}));
const encoderMetadata = Object.fromEntries(encoderEntries.map((entry) => [entry.name, entry]));
const nav = document.getElementById("nav");
const currentNode = document.getElementById("current");
const historyNode = document.getElementById("history");
const rows = document.getElementById("rows");
const examplesNode = document.getElementById("examples");

let currentEncoder = encoderEntries[0];
let currentOrdinal = null;
let path = [];
let pathCursor = 0;
let previews = [];
let numberEncoders = null;
const cacheLimit = 2000;
const structuralKeyCache = new WeakMap();
const latexCache = new Map();
const childrenCache = new Map();
const rootChildrenCache = new Map();
const previewComplexityCache = new WeakMap();

populateEncoderNav(nav);

nav.addEventListener("click", (event) => {
  if (!shouldHandleAppClick(event)) {
    return;
  }
  const link = event.target.closest("a[data-encoder]");
  if (link === null || !nav.contains(link)) {
    return;
  }
  event.preventDefault();
  navigateToHash(link.hash);
});

for (let index = 0; index < buttonCount; index += 1) {
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.index = String(index);
  rows.appendChild(row);
}

rows.addEventListener("click", (event) => {
  if (!shouldHandleAppClick(event)) {
    return;
  }
  const row = event.target.closest(".row");
  if (row === null || !rows.contains(row)) {
    return;
  }

  event.preventDefault();
  playMove(Number(row.dataset.index));
});

function playMove(index) {
  const next = previews[index];
  if (next === undefined || playablePreviewLatex(next) === null) {
    return;
  }

  const futureStep = path[pathCursor];
  if (
    futureStep !== undefined &&
    futureStep.index === index &&
    sameOrdinal(futureStep.ordinal, next)
  ) {
    pathCursor += 1;
    currentOrdinal = futureStep.ordinal;
  } else {
    path = path.slice(0, pathCursor);
    path.push({ index, ordinal: next });
    pathCursor = path.length;
    currentOrdinal = next;
  }

  syncLocationHash();
  render();
}

historyNode.addEventListener("click", (event) => {
  if (!shouldHandleAppClick(event)) {
    return;
  }
  const link = event.target.closest("a[data-prefix]");
  if (link === null || !historyNode.contains(link)) {
    return;
  }
  event.preventDefault();
  const prefix = Number(link.dataset.prefix);
  goToPrefix(prefix === pathCursor && prefix > 0 ? prefix - 1 : prefix);
});

examplesNode.addEventListener("click", (event) => {
  if (!shouldHandleAppClick(event)) {
    return;
  }
  const link = event.target.closest("a.example-link");
  if (link === null || !examplesNode.contains(link)) {
    return;
  }
  event.preventDefault();
  navigateToHash(link.hash);
});

window.addEventListener("hashchange", loadHashState);
window.addEventListener("load", render);
window.addEventListener("keydown", (event) => {
  if (shouldIgnoreNavigationKey(event)) {
    return;
  }
  const key = event.key.toLowerCase();
  if (/^\d$/.test(key)) {
    const index = Number(key);
    if (index < buttonCount) {
      event.preventDefault();
      playMove(index);
    }
  } else if (key === "arrowleft" || key === "p") {
    event.preventDefault();
    stepPathCursor(-1);
  } else if (key === "arrowright" || key === "n") {
    event.preventDefault();
    stepPathCursor(1);
  } else if (key === "f") {
    event.preventDefault();
    goToPrefix(0);
  } else if (key === "l") {
    event.preventDefault();
    goToPrefix(path.length);
  } else if (key === "r") {
    event.preventDefault();
    resetExplorer();
  } else if (key === "backspace") {
    event.preventDefault();
    deleteHistoryStep();
  }
});

loadHashState();
void initializeNumberEncoders();

async function initializeNumberEncoders() {
  try {
    const [primeIndex, ...loadedAdmissibleData] = await Promise.all([
      loadPrimeIndex(),
      ...collapsingNames.map((name) => loadAdmissibleData(name)),
    ]);
    const admissibleDataByName = Object.fromEntries(
      collapsingNames.map((name, index) => [name, loadedAdmissibleData[index]]),
    );
    if (Object.values(admissibleDataByName).some(
      (data) => data.maximumRank !== primeIndex.maximumRank,
    )) {
      throw new Error("Explorer data files have mismatched limits");
    }
    numberEncoders = Object.freeze(Object.fromEntries(
      encoderEntries.map((entry) => [
        entry.name,
        entry.api.createEncoder(primeIndex, admissibleDataByName[entry.name]),
      ]),
    ));
    render();
  } catch (error) {
    console.error("Could not load Explorer natural-number data.", error);
  }
}

function loadHashState() {
  const state = parseLocationHash();
  if (state === null) {
    currentEncoder = encoderEntries[0];
    currentOrdinal = null;
    path = [];
    pathCursor = 0;
    replaceHash("");
  } else if (!applyHashState(state)) {
    currentEncoder = state.encoder;
    currentOrdinal = null;
    path = [];
    pathCursor = 0;
    replaceHash(`#${state.encoder.name}`);
  }
  render();
}

function parseLocationHash() {
  let text = "";
  try {
    text = window.location.hash ? decodeURIComponent(window.location.hash.slice(1)).trim() : "";
  } catch {
    return null;
  }
  if (text === "") {
    return { encoder: encoderEntries[0], moves: [], cursor: 0 };
  }
  const match = /^([^,]+)(?:,([0-9]*)(?:,([0-9]*))?)?$/.exec(text);
  if (match === null) {
    return null;
  }
  const encoder = encoderMetadata[match[1]];
  if (encoder === undefined) {
    return null;
  }
  const past = match[2] ?? "";
  const future = match[3] ?? "";
  const moves = [...past, ...future].map((digit) => Number(digit));
  if (moves.some((move) => move >= buttonCount)) {
    return null;
  }
  return { encoder, moves, cursor: past.length };
}

function applyHashState({ encoder, moves, cursor }) {
  const nextPath = [];
  let nextOrdinal = null;
  for (const index of moves) {
    const children = nextOrdinal === null
      ? rootChildrenForEncoder(encoder)
      : childrenForEncoder(encoder, nextOrdinal);
    const ordinal = children[index];
    if (ordinal === undefined) {
      return false;
    }
    nextPath.push({ index, ordinal });
    nextOrdinal = ordinal;
    if (exceedsCurrentComplexityLimit(ordinal)) {
      return false;
    }
  }

  currentEncoder = encoder;
  path = nextPath;
  pathCursor = Math.max(0, Math.min(path.length, cursor));
  currentOrdinal = pathCursor === 0 ? null : path[pathCursor - 1].ordinal;
  return true;
}

function goToPrefix(prefix) {
  const nextCursor = Math.max(0, Math.min(path.length, Number(prefix)));
  if (nextCursor === pathCursor) {
    return false;
  }
  pathCursor = nextCursor;
  currentOrdinal = pathCursor === 0 ? null : path[pathCursor - 1].ordinal;
  syncLocationHash();
  render();
  return true;
}

function deleteHistoryStep() {
  if (pathCursor < path.length) {
    path = path.slice(0, pathCursor);
  } else if (pathCursor > 0) {
    path = path.slice(0, pathCursor - 1);
    pathCursor -= 1;
    currentOrdinal = pathCursor === 0 ? null : path[pathCursor - 1].ordinal;
  } else {
    return;
  }
  syncLocationHash();
  render();
}

function stepPathCursor(delta) {
  return goToPrefix(pathCursor + Number(delta));
}

function resetExplorer() {
  if (currentOrdinal === null && path.length === 0 && pathCursor === 0) {
    return false;
  }
  currentOrdinal = null;
  path = [];
  pathCursor = 0;
  syncLocationHash();
  render();
  return true;
}

function syncLocationHash() {
  replaceHash(compactHashForPrefix(pathCursor));
}

function compactHashForPrefix(prefix) {
  return compactHash(currentEncoder, path, prefix);
}

function compactHashAfterMove(index) {
  const next = previews[index];
  const futureStep = path[pathCursor];
  if (
    futureStep !== undefined &&
    futureStep.index === index &&
    sameOrdinal(futureStep.ordinal, next)
  ) {
    return compactHash(currentEncoder, path, pathCursor + 1);
  }
  const nextPath = path.slice(0, pathCursor);
  nextPath.push({ index, ordinal: next });
  return compactHash(currentEncoder, nextPath, nextPath.length);
}

function compactHash(encoder, steps, prefix) {
  const cursor = Math.max(0, Math.min(steps.length, Number(prefix)));
  const past = steps.slice(0, cursor).map((step) => step.index).join("");
  const future = steps.slice(cursor).map((step) => step.index).join("");
  if (future !== "") {
    return `#${encoder.name},${past},${future}`;
  }
  if (past !== "") {
    return `#${encoder.name},${past}`;
  }
  return `#${encoder.name}`;
}

function replaceHash(hash) {
  const normalizedHash = hash && !hash.startsWith("#") ? `#${hash}` : hash;
  const nextUrl = `${window.location.pathname}${normalizedHash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl !== currentUrl && window.history && window.history.replaceState) {
    window.history.replaceState(null, "", nextUrl);
  }
}

function navigateToHash(hash) {
  replaceHash(hash);
  loadHashState();
}

function sameOrdinal(left, right) {
  if (left === right) {
    return true;
  }
  try {
    return structuralKey(left) === structuralKey(right);
  } catch {
    return false;
  }
}

function shouldIgnoreNavigationKey(event) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return true;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)
  );
}

function shouldHandleAppClick(event) {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  );
}

function render() {
  highlightEncoder();
  renderHistory();
  renderExamples();
  const root = currentOrdinal === null;
  const currentLatex = root ? currentEncoder.rootLatex : safeToLatex(currentOrdinal) ?? "?";
  renderCurrent(currentLatex, root ? null : safeNatural(currentOrdinal));

  previews = root
    ? safeRootChildren()
    : safeChildren(currentOrdinal);

  for (const row of rows.children) {
    const index = Number(row.dataset.index);
    const child = previews[index];
    const childLatex = playablePreviewLatex(child);
    if (childLatex === null) {
      row.hidden = true;
      delete row.dataset.renderKey;
      row.replaceChildren();
      continue;
    }

    row.hidden = false;
    const natural = safeNatural(child);
    row.setAttribute(
      "aria-label",
      natural === null ? `alpha ${index}` : `alpha ${index}, natural number ${natural}`,
    );
    renderOption(row, index, childLatex, natural, "value");
  }
  nav.classList.add("ready");
}

function renderCurrent(latex, natural) {
  const renderKey = `${latex}:${natural ?? ""}`;
  if (currentNode.dataset.renderKey === renderKey) {
    return;
  }
  currentNode.dataset.renderKey = renderKey;

  const ordinal = document.createElement("span");
  ordinal.className = "current-ordinal";
  renderMath(`\\alpha=${latex}`, ordinal, {displayMode: true});
  const children = [ordinal];
  if (natural !== null) {
    children.push(naturalNumberNode(natural));
  }
  currentNode.replaceChildren(...children);
}

function renderExamples() {
  const examples = currentEncoder.examples ?? [];
  if (examples.length === 0) {
    examplesNode.hidden = true;
    examplesNode.replaceChildren();
    delete examplesNode.dataset.renderKey;
    return;
  }

  const renderKey = `${currentEncoder.name}:${examples.join(";")}`;
  if (examplesNode.dataset.renderKey === renderKey) {
    examplesNode.hidden = false;
    return;
  }
  examplesNode.dataset.renderKey = renderKey;
  examplesNode.hidden = false;
  examplesNode.replaceChildren();

  const label = document.createElement("span");
  label.textContent = "Examples: ";
  examplesNode.append(label);

  for (const [exampleIndex, movesText] of examples.entries()) {
    const link = document.createElement("a");
    link.className = "example-link";
    link.href = `#${currentEncoder.name},${movesText}`;
    link.textContent = `[${exampleIndex + 1}]`;
    examplesNode.append(link);
  }
}

function playablePreviewLatex(ordinal) {
  if (ordinal === undefined || exceedsPreviewComplexityLimit(ordinal)) {
    return null;
  }
  const latex = safeToLatex(ordinal) ?? "?";
  return exceedsPreviewLatexDepthLimit(latex) ? null : latex;
}

function exceedsCurrentComplexityLimit(ordinal) {
  return mobilePreviewSafetyEnabled && exceedsPreviewComplexityLimit(ordinal);
}

function renderOption(row, index, latex, natural, state) {
  const href = compactHashAfterMove(index);
  const renderKey = `${state}:${index}:${href}:${latex}:${natural ?? ""}`;
  if (row.dataset.renderKey === renderKey) {
    renderMath(latex, row.querySelector(".rhs"), { displayMode: true });
    return;
  }
  row.dataset.renderKey = renderKey;

  const lhs = document.createElement("a");
  lhs.className = "lhs";
  lhs.href = href;
  lhs.dataset.index = String(index);
  lhs.textContent = `α[${index}]`;

  const rhs = document.createElement("span");
  rhs.className = "rhs";
  renderMath(latex, rhs, { displayMode: true });

  const children = [lhs, rhs];
  if (natural !== null) {
    children.push(naturalNumberNode(natural));
  }
  row.replaceChildren(...children);
}

function naturalNumberNode(natural) {
  const node = document.createElement("span");
  node.className = "natural-number";
  node.setAttribute("aria-label", `natural number ${natural}`);
  node.textContent = `↦ ${natural.toLocaleString()}`;
  return node;
}

function renderHistory() {
  historyNode.replaceChildren();
  const rootLink = historyLink(0);
  rootLink.setAttribute("aria-label", "root");
  rootLink.textContent = "[*]";
  historyNode.append(rootLink);

  for (const [index, step] of path.entries()) {
    const link = historyLink(index + 1);
    link.textContent = `[${step.index}]`;
    link.setAttribute("aria-label", path.slice(0, index + 1).map((item) => `[${item.index}]`).join(""));
    historyNode.append(link);
  }
}

function historyLink(prefix) {
  const link = document.createElement("a");
  link.href = compactHashForPrefix(prefix);
  link.dataset.prefix = String(prefix);
  link.classList.toggle("active", prefix === pathCursor);
  link.classList.toggle("future", prefix > pathCursor);
  return link;
}

function highlightEncoder() {
  applyPageMetadata(encoderPageTitle(currentEncoder, "Explorer"), currentEncoder.favicon);
  for (const link of nav.querySelectorAll("a[data-encoder]")) {
    link.classList.toggle("active", link.dataset.encoder === currentEncoder.name);
  }
}

function safeChildren(ordinal) {
  return childrenForEncoder(currentEncoder, ordinal);
}

function childrenForEncoder(encoder, ordinal) {
  const cacheKey = ordinalCacheKey(encoder, ordinal);
  if (cacheKey !== null && childrenCache.has(cacheKey)) {
    return childrenCache.get(cacheKey);
  }
  try {
    const encoderChildren = encoder.api.children(ordinal, buttonCount);
    const result = encoderChildren.length ? encoderChildren : successorChildrenForEncoder(encoder, ordinal);
    if (cacheKey !== null) {
      setBoundedCache(childrenCache, cacheKey, result);
    }
    return result;
  } catch {
    const result = successorChildrenForEncoder(encoder, ordinal);
    if (cacheKey !== null) {
      setBoundedCache(childrenCache, cacheKey, result);
    }
    return result;
  }
}

function successorChildrenForEncoder(encoder, ordinal) {
  if (buttonCount === 0 || typeof encoder.api.predecessor !== "function") {
    return [];
  }
  try {
    const predecessor = encoder.api.predecessor(ordinal);
    return predecessor === null || predecessor === undefined ? [] : [predecessor];
  } catch {
    return [];
  }
}

function safeRootChildren() {
  return rootChildrenForEncoder(currentEncoder);
}

function rootChildrenForEncoder(encoder) {
  if (rootChildrenCache.has(encoder.name)) {
    return rootChildrenCache.get(encoder.name);
  }
  const result = encoder.rootChildren();
  setBoundedCache(rootChildrenCache, encoder.name, result);
  return result;
}

function safeToLatex(ordinal) {
  const cacheKey = ordinalCacheKey(currentEncoder, ordinal);
  if (cacheKey !== null && latexCache.has(cacheKey)) {
    return latexCache.get(cacheKey);
  }
  try {
    const result = currentEncoder.api.toLatex(ordinal);
    if (cacheKey !== null) {
      setBoundedCache(latexCache, cacheKey, result);
    }
    return result;
  } catch {
    return null;
  }
}

function safeNatural(ordinal) {
  const encoder = numberEncoders?.[currentEncoder.name];
  if (encoder === undefined) {
    return null;
  }
  try {
    return encoder.natural(ordinal);
  } catch {
    return null;
  }
}

function exceedsPreviewComplexityLimit(ordinal) {
  const complexity = structuralPreviewComplexity(ordinal);
  if (complexity.units > previewTermLimit) {
    return true;
  }
  return mobilePreviewSafetyEnabled && (
    complexity.maxDepth > mobilePreviewRecursionDepthLimit
  );
}

function exceedsPreviewLatexDepthLimit(latex) {
  return latexBraceDepth(latex) > previewBraceDepthLimit;
}

function latexBraceDepth(latex) {
  let depth = 0;
  let maxDepth = 0;
  let escaped = false;
  for (const character of latex) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (character === "{") {
      depth += 1;
      maxDepth = Math.max(maxDepth, depth);
    } else if (character === "}") {
      depth = Math.max(0, depth - 1);
    }
  }
  return maxDepth;
}

function structuralPreviewComplexity(value) {
  if (!isObjectKey(value)) {
    return { units: 0, maxDepth: 0 };
  }
  const cached = previewComplexityCache.get(value);
  if (cached !== undefined) {
    return cached;
  }

  const result = { units: 0, maxDepth: 0 };
  const seen = new WeakSet();
  const stack = [{ value, depth: 0 }];
  while (
    stack.length &&
    result.units <= previewTermLimit &&
    (
      !mobilePreviewSafetyEnabled ||
      result.maxDepth <= mobilePreviewRecursionDepthLimit
    )
  ) {
    const { value: item, depth } = stack.pop();
    if (!isObjectKey(item) || seen.has(item)) {
      continue;
    }
    seen.add(item);
    result.maxDepth = Math.max(result.maxDepth, depth);

    if (Array.isArray(item.terms)) {
      result.units += item.terms.length;
    }
    if (Array.isArray(item.entries)) {
      result.units += item.entries.length;
    }

    const children = Array.isArray(item) ? item : Object.values(item);
    for (const child of children) {
      if (isObjectKey(child)) {
        stack.push({ value: child, depth: depth + 1 });
      }
    }
  }

  previewComplexityCache.set(value, result);
  return result;
}

function ordinalCacheKey(encoder, ordinal) {
  if (!isObjectKey(ordinal)) {
    return null;
  }
  try {
    return `${encoder.name}:${structuralKey(ordinal)}`;
  } catch {
    return null;
  }
}

function structuralKey(value) {
  if (!isObjectKey(value)) {
    return `${typeof value}:${String(value)}`;
  }
  const cached = structuralKeyCache.get(value);
  if (cached !== undefined) {
    return cached;
  }

  const key = Array.isArray(value)
    ? `[${value.map(structuralKey).join(",")}]`
    : `{${Object.keys(value)
        .sort()
        .map((name) => `${name}:${structuralKey(value[name])}`)
        .join(",")}}`;
  structuralKeyCache.set(value, key);
  return key;
}

function setBoundedCache(cache, key, value) {
  if (cache.size >= cacheLimit) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, value);
}

function isObjectKey(value) {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function renderMath(latex, node, options = {}) {
  const displayMode = options.displayMode === true;
  const renderKey = `${displayMode ? "display" : "inline"}:${latex}`;
  if (node.dataset.latex === renderKey) {
    return;
  }
  if (window.katex && typeof window.katex.render === "function") {
    window.katex.render(latex, node, {
      displayMode,
      throwOnError: false,
      output: "html",
      strict: "ignore",
    });
    node.dataset.latex = renderKey;
  } else {
    delete node.dataset.latex;
    node.textContent = latex;
  }
}
