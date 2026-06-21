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
  encoders,
  encodersByName,
  populateEncoderNav,
} from "./encoders.js";
import { installHoldButton } from "./hold_button.js";
import { createSievedPrimeIndex } from "./natural_number_encoding.js";

await window.katexReady;

const NOTATIONS = {
  cantor,
  binary,
  finitary,
  transfinitary,
  buchholz_1: buchholz1,
  buchholz,
  ebocf,
};
const COLLAPSING_NAMES = new Set(["buchholz_1", "buchholz", "ebocf"]);

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

function selectedEncoder() {
  const hash = window.location.hash.slice(1);
  if (Object.prototype.hasOwnProperty.call(encodersByName, hash)) {
    return hash;
  }
  if (hash !== "" && window.history && window.history.replaceState) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  }
  return "cantor";
}

const nav = document.getElementById("nav");
populateEncoderNav(nav);
nav.insertAdjacentHTML("beforeend", ' <label class="nav-toggle" aria-label="ordinal sort"><input id="sort-by-ordinal" type="checkbox" aria-keyshortcuts="s"> <span class="full-label">ordinal sort</span><span class="short-label">ord</span></label>');
const links = Array.from(nav.querySelectorAll("a"));
nav.addEventListener("click", (event) => {
  if (
    event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey ||
    event.metaKey || event.shiftKey
  ) {
    return;
  }
  const link = event.target.closest('a[href^="#"]');
  if (link === null || !nav.contains(link)) {
    return;
  }
  event.preventDefault();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${link.hash}`
  );
  loadSelectedEncoder();
});
const rows = document.getElementById("rows");
const sortByOrdinal = document.getElementById("sort-by-ordinal");
const pageNavigation = document.getElementById("page-navigation");
const pageNavigationGroup = pageNavigation.querySelector(".page-navigation-group");
const pageFirst = document.getElementById("page-first");
const pagePrevious = document.getElementById("page-previous");
const pageNext = document.getElementById("page-next");
const pageLast = document.getElementById("page-last");
const pageNumber = document.getElementById("page-number");
const bundlePromises = new Map();
const primeIndexByMaximum = new Map();
const encodingByName = new Map();
let currentEncoder = null;
let currentOrder = null;
let rowSource = {length: 0, slice: () => []};
let currentRows = [];
let currentPage = 0;
let gridColumns = 1;
let gridOffsets = [0];
const measuredRowHeights = new Map();
let mountedStart = 0;
let mountedEnd = 0;
const reusableRowNodes = [];
let renderFrame = null;
let viewportFrame = null;
let loadToken = 0;
const edgeThreshold = 8;
const heightStepsPerEm = 20;
const mountBufferScreens = 3;
const renderBufferScreens = 0.5;
const renderBudgetMilliseconds = 8;
const maximumPageRows = 250;

function encoderBundle(name) {
  let promise = bundlePromises.get(name);
  if (promise !== undefined) {
    return promise;
  }
  const url = `./data/${name}.bin`;
  promise = fetch(url).then((response) => {
    if (!response.ok) {
      throw new Error(`Could not fetch ${url}`);
    }
    return response.arrayBuffer();
  }).then(decodeOrdinalBundle).catch((error) => {
    if (bundlePromises.get(name) === promise) {
      bundlePromises.delete(name);
    }
    throw error;
  });
  bundlePromises.set(name, promise);
  return promise;
}

const bundleMagic = "ORB1";
const bundleHeaderSize = 16;

function readBitplaneValues(bytes, offset, count, bits) {
  const values = new Uint32Array(count);
  for (let bit = 0; bit < bits; bit += 1) {
    for (let index = 0; index < count; index += 1) {
      const bitOffset = bit * count + index;
      values[index] = (
        values[index] * 2 +
        ((bytes[offset + (bitOffset >> 3)] >> (bitOffset & 7)) & 1)
      );
    }
  }
  return values;
}

function decodeOrdinalBundle(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < bundleHeaderSize) {
    throw new Error("Invalid encoder skeleton bundle");
  }
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== bundleMagic) {
    throw new Error("Invalid encoder skeleton bundle");
  }
  const rowCount = view.getUint32(4, true);
  const maximum = view.getUint32(8, true);
  const rankBits = view.getUint8(12);
  const admissibilityBits = view.getUint8(13);
  const heightRunCount = view.getUint16(14, true);
  if (
    rowCount < 1 || maximum < 2 || rankBits < 1 || rankBits > 32 ||
    admissibilityBits > 32 || heightRunCount < 1
  ) {
    throw new Error("Invalid encoder skeleton bundle");
  }

  const rankOffset = bundleHeaderSize;
  const rankSize = Math.ceil(rowCount * rankBits / 8);
  const heightOffset = rankOffset + rankSize;
  const admissibilityOffset = heightOffset + 3 * heightRunCount;
  const admissibilitySize = Math.ceil(rowCount * admissibilityBits / 8);
  if (admissibilityOffset + admissibilitySize !== bytes.length) {
    throw new Error("Invalid encoder skeleton bundle size");
  }

  const ordinalRanks = readBitplaneValues(bytes, rankOffset, rowCount, rankBits);
  const seenRanks = new Uint8Array(rowCount);
  for (const rank of ordinalRanks) {
    if (rank >= rowCount || seenRanks[rank]) {
      throw new Error("Invalid encoder skeleton rank permutation");
    }
    seenRanks[rank] = 1;
  }

  const ordinalHeights = new Uint8Array(rowCount);
  let rowIndex = 0;
  for (let runIndex = 0; runIndex < heightRunCount; runIndex += 1) {
    const offset = heightOffset + 3 * runIndex;
    const count = view.getUint16(offset, true);
    const height = view.getUint8(offset + 2);
    if (count < 1 || height < 1 || rowIndex + count > rowCount) {
      throw new Error("Invalid encoder skeleton height runs");
    }
    ordinalHeights.fill(height, rowIndex, rowIndex + count);
    rowIndex += count;
  }
  if (rowIndex !== rowCount) {
    throw new Error("Invalid encoder skeleton height runs");
  }

  let admissibleData;
  if (admissibilityBits > 0) {
    const excesses = readBitplaneValues(
      bytes,
      admissibilityOffset,
      rowCount,
      admissibilityBits,
    );
    const checkpoints = new Uint32Array(rowCount + 1);
    for (let rank = 1; rank <= rowCount; rank += 1) {
      const rawCode = checkpoints[rank - 1] + excesses[rank - 1] + 1;
      if (rawCode > 0xffff_ffff) {
        throw new Error("Invalid encoder skeleton admissibility data");
      }
      checkpoints[rank] = rawCode;
    }
    admissibleData = Object.freeze({
      maximumRank: rowCount,
      segments: Object.freeze([Object.freeze({
        startRank: 0,
        stride: 1,
        checkpointOffset: 0,
        checkpointCount: rowCount + 1,
      })]),
      checkpoints,
    });
  }
  return Object.freeze({maximum, ordinalRanks, ordinalHeights, admissibleData});
}

function maxScrollY() {
  return Math.max(0, documentHeight() - window.innerHeight);
}

function pageButtonDisabled(button) {
  return button.getAttribute("aria-disabled") === "true";
}

function updatePageNavigation() {
  const atStart = window.scrollY <= edgeThreshold;
  const atEnd = window.scrollY >= maxScrollY() - edgeThreshold;
  const bounds = pageBounds(rowSource.length);
  const firstPage = bounds.index === 0;
  const lastPage = bounds.index === bounds.pageCount - 1;
  pageFirst.setAttribute("aria-disabled", String(firstPage && atStart));
  pagePrevious.setAttribute("aria-disabled", String(firstPage));
  pageNext.setAttribute("aria-disabled", String(lastPage));
  pageLast.setAttribute("aria-disabled", String(lastPage && atEnd));
  pageNumber.textContent = rowSource.length === 0 ? "" : String(bounds.index + 1);
}

function updatePageNavigationLayout() {
  pageNavigationGroup.style.width = `${nav.getBoundingClientRect().width}px`;
  nav.classList.add("ready");
  pageNavigation.classList.add("ready");
}

function scrollToY(y) {
  const target = Math.min(maxScrollY(), Math.max(0, y));
  window.scrollTo(0, target);
  updatePageNavigation();
  updateRenderedRows(true);
}

function viewportContentBounds() {
  const top = Math.max(0, nav.getBoundingClientRect().bottom);
  const toolbarTop = pageNavigation.getBoundingClientRect().top;
  const bottom = toolbarTop > top ? toolbarTop : window.innerHeight;
  return {top, bottom};
}

function installPageButton(button, action) {
  let activePointerId = null;

  button.addEventListener("pointerdown", (event) => {
    if (
      (activePointerId !== null && activePointerId !== event.pointerId) ||
      pageButtonDisabled(button) || !event.isPrimary || event.button !== 0
    ) {
      return;
    }
    activePointerId = event.pointerId;
    event.preventDefault();
  });
  window.addEventListener("pointerup", (event) => {
    if (event.pointerId !== activePointerId) {
      return;
    }
    activePointerId = null;
    event.preventDefault();
    const rect = button.getBoundingClientRect();
    const releasedInside = (
      event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom
    );
    if (pageButtonDisabled(button) || !releasedInside) {
      return;
    }
    action();
  });
  const cancelPointer = (event) => {
    if (event.pointerId === activePointerId) {
      activePointerId = null;
    }
  };
  window.addEventListener("pointercancel", cancelPointer);
  window.addEventListener("blur", () => {
    activePointerId = null;
  });
  button.addEventListener("click", (event) => {
    if (event.detail > 0) {
      event.preventDefault();
      return;
    }
    if (pageButtonDisabled(button)) {
      event.preventDefault();
      return;
    }
    action();
  });
}

function highlightEncoder(name) {
  const encoder = encodersByName[name];
  applyPageMetadata(encoderPageTitle(encoder, "Well-Ordering"), encoder.favicon);
  for (const link of links) {
    link.classList.toggle("active", link.hash === `#${name}`);
  }
}

function selectedOrder() {
  return sortByOrdinal.checked ? "ordinal" : "number";
}

function setPlaceholder(state) {
  if (state.node !== null) {
    state.node.textContent = "";
  }
}

function encodingFor(name, skeleton) {
  const cached = encodingByName.get(name);
  if (cached !== undefined) {
    return cached;
  }
  if (COLLAPSING_NAMES.has(name) !== (skeleton.admissibleData !== undefined)) {
    throw new Error("Encoder skeleton admissibility mismatch");
  }
  let primeIndex = primeIndexByMaximum.get(skeleton.maximum);
  if (primeIndex === undefined) {
    primeIndex = createSievedPrimeIndex(skeleton.maximum);
    primeIndexByMaximum.set(skeleton.maximum, primeIndex);
  }
  if (primeIndex.maximumRank !== skeleton.ordinalRanks.length) {
    throw new Error("Encoder skeleton prime count mismatch");
  }
  const notation = NOTATIONS[name];
  const encoding = Object.freeze({
    primeIndex,
    notation,
    numberEncoder: notation.createEncoder(primeIndex, skeleton.admissibleData),
    latexByRank: new Map(),
  });
  encodingByName.set(name, encoding);
  return encoding;
}

function createRowSource(skeleton, order, encoding) {
  const rowCount = skeleton.ordinalRanks.length;
  const heightByRank = new Uint8Array(rowCount);
  for (let index = 0; index < rowCount; index += 1) {
    heightByRank[skeleton.ordinalRanks[index]] = skeleton.ordinalHeights[index];
  }
  return {
    length: rowCount,
    slice(start, end) {
      return Array.from({length: end - start}, (_, offset) => {
        const index = start + offset;
        const rank = order === "ordinal" ? skeleton.ordinalRanks[index] : index;
        return {
          rank,
          height: heightByRank[rank],
          encoding,
          node: null,
          rendered: false,
        };
      });
    },
  };
}

function pagination(rowCount) {
  if (rowCount % 2 !== 0) {
    throw new Error("Page row count must be even");
  }
  const pairCount = rowCount / 2;
  const pageCount = Math.max(1, Math.ceil(rowCount / maximumPageRows));
  return {
    pageCount,
    shortPagePairs: Math.floor(pairCount / pageCount),
    longPageCount: pairCount % pageCount,
  };
}

function pageBounds(rowCount, page = currentPage) {
  const {pageCount, shortPagePairs, longPageCount} = pagination(rowCount);
  const index = Math.max(0, Math.min(pageCount - 1, page));
  const start = 2 * (index * shortPagePairs + Math.min(index, longPageCount));
  const size = 2 * (shortPagePairs + (index < longPageCount ? 1 : 0));
  return {index, pageCount, start, end: start + size};
}

function rowsForCurrentPage(source) {
  const bounds = pageBounds(source.length);
  currentPage = bounds.index;
  return source.slice(bounds.start, bounds.end);
}

function documentHeight() {
  return Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
}

function viewportAnchorY(scrollProgress) {
  const {top, bottom} = viewportContentBounds();
  return top + Math.max(0, bottom - top) * scrollProgress;
}

function offsetIndex(y) {
  let low = 0;
  let high = gridOffsets.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (gridOffsets[middle] <= y) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return Math.max(0, Math.min(gridOffsets.length - 2, low - 1));
}

function scrollAnchor() {
  const maxScroll = maxScrollY();
  if (maxScroll <= 0 || currentRows.length === 0) {
    return null;
  }
  if (window.scrollY <= edgeThreshold) {
    return {kind: "top"};
  }
  if (window.scrollY >= maxScroll - edgeThreshold) {
    return {kind: "bottom"};
  }

  const scrollProgress = window.scrollY / maxScroll;
  const anchorY = viewportAnchorY(scrollProgress);
  const rowsRect = rows.getBoundingClientRect();
  const gridRow = offsetIndex(anchorY - rowsRect.top);
  const index = Math.min(currentRows.length - 1, gridRow * gridColumns);
  const gridRowTop = gridOffsets[gridRow];
  const gridRowHeight = gridOffsets[gridRow + 1] - gridRowTop;
  return {
    kind: "row",
    index,
    rowFraction: Math.min(1, Math.max(0, (anchorY - rowsRect.top - gridRowTop) / gridRowHeight)),
    scrollProgress
  };
}

function restoreAnchor(anchor) {
  if (anchor === null) {
    return;
  }
  if (anchor.kind === "top") {
    window.scrollTo(0, 0);
    return;
  }
  if (anchor.kind === "bottom") {
    window.scrollTo(0, maxScrollY());
    return;
  }
  const index = Math.min(anchor.index, currentRows.length - 1);
  if (index < 0) {
    return;
  }

  const gridRow = Math.floor(index / gridColumns);
  const gridRowTop = gridOffsets[gridRow];
  const gridRowHeight = gridOffsets[gridRow + 1] - gridRowTop;
  const rowsTop = rows.getBoundingClientRect().top;
  const targetY = rowsTop + gridRowTop + gridRowHeight * anchor.rowFraction;
  window.scrollTo(0, window.scrollY + targetY - viewportAnchorY(anchor.scrollProgress));
}

function positionRow(index, row) {
  const column = index % gridColumns;
  row.className = `row row-column-${column}`;
  row.style.top = `${gridOffsets[Math.floor(index / gridColumns)]}px`;
  row.style.setProperty("--row-height", `${currentRows[index].height / heightStepsPerEm}em`);
}

function mountRow(index, fragment) {
  const state = currentRows[index];
  const row = reusableRowNodes.pop() ?? document.createElement("div");
  positionRow(index, row);
  state.node = row;
  fragment.appendChild(row);
}

function unmountRow(index) {
  const state = currentRows[index];
  if (state === undefined || state.node === null) {
    return;
  }
  if (state.rendered) {
    unrenderRow(index);
  }
  const row = state.node;
  state.node = null;
  row.remove();
  reusableRowNodes.push(row);
}

function clearMountedRows() {
  for (let index = mountedStart; index < mountedEnd; index += 1) {
    unmountRow(index);
  }
  mountedStart = 0;
  mountedEnd = 0;
}

function mountRows(start, end) {
  if (start === mountedStart && end === mountedEnd) {
    return;
  }

  const oldStart = mountedStart;
  const oldEnd = mountedEnd;
  const overlaps = start < oldEnd && end > oldStart;
  if (!overlaps) {
    for (let index = oldStart; index < oldEnd; index += 1) {
      unmountRow(index);
    }
    const fragment = document.createDocumentFragment();
    for (let index = start; index < end; index += 1) {
      mountRow(index, fragment);
    }
    rows.appendChild(fragment);
  } else {
    for (let index = oldStart; index < Math.min(start, oldEnd); index += 1) {
      unmountRow(index);
    }
    for (let index = Math.max(end, oldStart); index < oldEnd; index += 1) {
      unmountRow(index);
    }

    if (start < oldStart) {
      const fragment = document.createDocumentFragment();
      for (let index = start; index < oldStart; index += 1) {
        mountRow(index, fragment);
      }
      rows.insertBefore(fragment, currentRows[oldStart].node);
    }
    if (end > oldEnd) {
      const fragment = document.createDocumentFragment();
      for (let index = oldEnd; index < end; index += 1) {
        mountRow(index, fragment);
      }
      rows.appendChild(fragment);
    }
  }

  mountedStart = start;
  mountedEnd = end;
}

function configuredGridColumns() {
  const styles = getComputedStyle(rows);
  return Math.max(1, Number(styles.getPropertyValue("--grid-columns")) || 1);
}

function measureRowHeights(states) {
  const missing = new Set();
  for (const {height} of states) {
    if (!measuredRowHeights.has(height)) {
      missing.add(height);
    }
  }
  if (missing.size === 0) {
    return;
  }
  const probe = document.createElement("div");
  probe.className = "row";
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  for (const height of missing) {
    probe.style.setProperty("--row-height", `${height / heightStepsPerEm}em`);
    measuredRowHeights.set(height, probe.getBoundingClientRect().height);
  }
  probe.remove();
}

function gridLayout(states) {
  if (states.length === 0) {
    return {columns: 1, offsets: [0]};
  }
  const columns = configuredGridColumns();
  measureRowHeights(states);
  const offsets = [0];
  for (let index = 0; index < states.length; index += columns) {
    let height = 0;
    for (let column = 0; column < columns && index + column < states.length; column += 1) {
      height = Math.max(height, measuredRowHeights.get(states[index + column].height));
    }
    offsets.push(offsets[offsets.length - 1] + height);
  }
  return {columns, offsets};
}

function applyGridLayout(layout) {
  gridColumns = layout.columns;
  gridOffsets = layout.offsets;
  rows.style.height = `${gridOffsets[gridOffsets.length - 1]}px`;
}

function replaceGrid(states, layout) {
  clearMountedRows();
  currentRows = states;
  applyGridLayout(layout);
}

function showPage(page, anchor) {
  if (rowSource.length === 0) {
    return false;
  }
  const bounds = pageBounds(rowSource.length, page);
  if (bounds.index === currentPage) {
    return false;
  }
  currentPage = bounds.index;
  const nextRows = rowSource.slice(bounds.start, bounds.end);
  const nextLayout = gridLayout(nextRows);
  cancelRendering();
  replaceGrid(nextRows, nextLayout);
  restoreAnchor(anchor);
  updatePageNavigation();
  updateRenderedRows();
  return true;
}

function showFirstPage() {
  if (!showPage(0, {kind: "top"})) {
    scrollToY(0);
  }
}

function showPreviousPage() {
  return showPage(currentPage - 1, {kind: "top"});
}

function showNextPage() {
  return showPage(currentPage + 1, {kind: "top"});
}

function showLastPage() {
  const lastPage = pagination(rowSource.length).pageCount - 1;
  if (!showPage(lastPage, {kind: "bottom"})) {
    scrollToY(maxScrollY());
  }
}

function handleShortcut(event) {
  const key = event.key.toLowerCase();
  if (
    event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
    (event.target === sortByOrdinal && key !== "s")
  ) {
    return;
  }
  if (key === "p" || key === "arrowleft") {
    event.preventDefault();
    showPreviousPage();
  } else if (key === "n" || key === "arrowright") {
    event.preventDefault();
    showNextPage();
  } else if (key === "f") {
    event.preventDefault();
    showFirstPage();
  } else if (key === "l") {
    event.preventDefault();
    showLastPage();
  } else if (key === "s") {
    event.preventDefault();
    sortByOrdinal.checked = !sortByOrdinal.checked;
    loadSelectedEncoder();
  }
}

function rowRange(marginScreens, rowsTop) {
  if (currentRows.length === 0) {
    return {start: 0, end: 0};
  }
  const margin = marginScreens * window.innerHeight;
  const firstGridRow = offsetIndex(-rowsTop - margin);
  const lastGridRow = offsetIndex(-rowsTop + window.innerHeight + margin);
  return {
    start: firstGridRow * gridColumns,
    end: Math.min(currentRows.length, (lastGridRow + 1) * gridColumns),
  };
}

function renderRow(index) {
  const state = currentRows[index];
  if (state === undefined || state.node === null || state.rendered) {
    return;
  }
  const {encoding, rank} = state;
  const n = encoding.primeIndex.primeAtIndex(rank + 1);
  let ordinalLatex = encoding.latexByRank.get(rank);
  if (ordinalLatex === undefined) {
    ordinalLatex = encoding.notation.toLatex(encoding.numberEncoder.ordinal(n));
    encoding.latexByRank.set(rank, ordinalLatex);
  }
  const latex = `${n} \\mapsto ${ordinalLatex}`;
  if (window.katex && typeof window.katex.render === "function") {
    window.katex.render(latex, state.node, {
      throwOnError: false,
      output: "html",
      strict: "ignore"
    });
  } else {
    state.node.textContent = latex;
  }
  state.rendered = true;
}

function unrenderRow(index) {
  const state = currentRows[index];
  if (state === undefined || !state.rendered) {
    return;
  }
  state.rendered = false;
  setPlaceholder(state);
}

function cancelRendering() {
  if (renderFrame !== null) {
    cancelAnimationFrame(renderFrame);
    renderFrame = null;
  }
  if (viewportFrame !== null) {
    cancelAnimationFrame(viewportFrame);
    viewportFrame = null;
  }
}

function updateRenderedRows(renderVisibleNow = false) {
  cancelRendering();
  if (currentRows.length === 0) {
    return;
  }

  const rowsTop = rows.getBoundingClientRect().top;
  const visible = rowRange(0, rowsTop);
  const mounted = rowRange(mountBufferScreens, rowsTop);
  const rendered = rowRange(renderBufferScreens, rowsTop);
  mountRows(mounted.start, mounted.end);

  for (let index = mounted.start; index < mounted.end; index += 1) {
    if (index < rendered.start || index >= rendered.end) {
      unrenderRow(index);
    }
  }

  if (renderVisibleNow) {
    for (let index = visible.start; index < visible.end; index += 1) {
      renderRow(index);
    }
  }

  const center = (visible.start + visible.end - 1) / 2;
  const pending = [];
  for (let index = rendered.start; index < rendered.end; index += 1) {
    if (!currentRows[index].rendered) {
      pending.push(index);
    }
  }
  pending.sort((a, b) => Math.abs(a - center) - Math.abs(b - center));
  let pendingIndex = 0;

  function renderBatch() {
    const deadline = performance.now() + renderBudgetMilliseconds;
    do {
      const index = pending[pendingIndex];
      if (index === undefined) {
        renderFrame = null;
        return;
      }
      pendingIndex += 1;
      renderRow(index);
    } while (performance.now() < deadline);
    renderFrame = requestAnimationFrame(renderBatch);
  }

  if (pending.length !== 0) {
    renderFrame = requestAnimationFrame(renderBatch);
  }
}

function scheduleRenderedRows() {
  if (viewportFrame !== null) {
    return;
  }
  viewportFrame = requestAnimationFrame(() => {
    viewportFrame = null;
    updateRenderedRows();
  });
}

async function loadSelectedEncoder() {
  const name = selectedEncoder();
  const order = selectedOrder();
  const token = ++loadToken;
  if (name === currentEncoder && order === currentOrder) {
    highlightEncoder(name);
    updatePageNavigation();
    return;
  }
  try {
    const skeleton = await encoderBundle(name);
    if (token !== loadToken) {
      return;
    }
    const encoding = encodingFor(name, skeleton);
    const anchor = currentEncoder === null ? null : scrollAnchor();
    const nextRowSource = createRowSource(skeleton, order, encoding);
    const nextRows = rowsForCurrentPage(nextRowSource);
    const nextLayout = gridLayout(nextRows);
    cancelRendering();
    rowSource = nextRowSource;
    replaceGrid(nextRows, nextLayout);
    currentEncoder = name;
    currentOrder = order;
    highlightEncoder(name);
    updatePageNavigationLayout();
    restoreAnchor(anchor);
    updatePageNavigation();
    updateRenderedRows();
  } catch (error) {
    console.error(`Failed to load ${name}`, error);
  }
}

highlightEncoder(selectedEncoder());
installPageButton(pageFirst, showFirstPage);
installHoldButton(pagePrevious, showPreviousPage);
installHoldButton(pageNext, showNextPage);
installPageButton(pageLast, showLastPage);
pageNavigation.addEventListener("contextmenu", (event) => event.preventDefault(), {capture: true});
pageNavigation.addEventListener("selectstart", (event) => event.preventDefault(), {capture: true});
pageNavigation.addEventListener("touchstart", (event) => event.preventDefault(), {capture: true, passive: false});
updatePageNavigationLayout();
updatePageNavigation();
loadSelectedEncoder();
void Promise.allSettled(encoders.map(({name}) => encoderBundle(name)));
window.addEventListener("hashchange", loadSelectedEncoder);
window.addEventListener("keydown", handleShortcut);
window.addEventListener("scroll", () => {
  updatePageNavigation();
  scheduleRenderedRows();
}, {passive: true});
window.addEventListener("resize", () => {
  updatePageNavigationLayout();
  const nextColumns = configuredGridColumns();
  if (nextColumns !== gridColumns) {
    const anchor = scrollAnchor();
    const nextRows = rowsForCurrentPage(rowSource);
    measuredRowHeights.clear();
    const nextLayout = gridLayout(nextRows);
    cancelRendering();
    replaceGrid(nextRows, nextLayout);
    restoreAnchor(anchor);
  }
  updatePageNavigation();
  updateRenderedRows();
});
sortByOrdinal.addEventListener("change", loadSelectedEncoder);
