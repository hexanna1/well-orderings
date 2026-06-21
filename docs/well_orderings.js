import { applyPageMetadata, encoders, encodersByName } from "./encoders.js";

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
nav.innerHTML = encoders.map(({name, label, shortLabel}) =>
  `<a href="#${name}" aria-label="${label}"><span class="full-label">${label}</span><span class="short-label">${shortLabel}</span></a>`
).join(" ");
nav.insertAdjacentHTML("beforeend", ' <a href="index.html">about</a>');
nav.insertAdjacentHTML("beforeend", ' <label class="sort-control" aria-label="ordinal sort"><input id="sort-by-ordinal" type="checkbox"> <span class="full-label">ordinal sort</span><span class="short-label">ord</span></label>');
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
let currentEncoder = null;
let currentOrder = null;
let allRows = [];
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
const maximumPageRows = 256;
const holdRepeatNumeratorMilliseconds = 250;

function encoderBundle(name) {
  let promise = bundlePromises.get(name);
  if (promise !== undefined) {
    return promise;
  }
  promise = fetch(`${name}.bin`).then((response) => {
    if (!response.ok) {
      throw new Error(`Could not fetch ${name}.bin`);
    }
    return response.arrayBuffer();
  }).catch((error) => {
    if (bundlePromises.get(name) === promise) {
      bundlePromises.delete(name);
    }
    throw error;
  });
  bundlePromises.set(name, promise);
  return promise;
}

void Promise.allSettled(encoders.map(({name}) => encoderBundle(name)));

const bundleMagic = "ORB1";
const latexTokens = [
  "\\begin{pmatrix}",
  "\\end{pmatrix}",
  "\\varepsilon",
  "\\varphi",
  "\\omega",
  "\\Omega",
  "\\zeta",
  "\\Gamma",
  "\\psi",
  "\\\\",
];

function parseRows(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 6) {
    throw new Error("Invalid encoder row bundle");
  }
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== bundleMagic) {
    throw new Error("Invalid encoder row bundle");
  }
  const rowCount = view.getUint16(4, true);
  const rowDataOffset = 6 + 2 * rowCount;
  if (rowDataOffset > bytes.length) {
    throw new Error("Truncated encoder row bundle");
  }
  const mappingRows = [];
  let offset = rowDataOffset;
  let previousLatex = new Uint8Array();
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    if (offset + 3 > bytes.length) {
      throw new Error("Truncated encoder row bundle");
    }
    const n = view.getUint16(6 + 2 * rowIndex, true);
    const height = view.getUint8(offset);
    const prefixLength = view.getUint8(offset + 1);
    const suffixLength = view.getUint8(offset + 2);
    offset += 3;
    const end = offset + suffixLength;
    if (height === 0 || prefixLength > previousLatex.length || end > bytes.length) {
      throw new Error("Truncated encoder row bundle");
    }
    const encodedLatex = new Uint8Array(prefixLength + suffixLength);
    encodedLatex.set(previousLatex.subarray(0, prefixLength));
    encodedLatex.set(bytes.subarray(offset, end), prefixLength);
    const parts = [];
    for (const byte of encodedLatex) {
      if (byte < 0x80) {
        parts.push(String.fromCharCode(byte));
        continue;
      }
      const token = latexTokens[byte - 0x80];
      if (token === undefined) {
        throw new Error("Unknown encoder row bundle token");
      }
      parts.push(token);
    }
    offset = end;
    previousLatex = encodedLatex;
    mappingRows.push({n, height, latex: parts.join("")});
  }
  if (offset !== bytes.length) {
    throw new Error("Invalid encoder row bundle size");
  }
  return mappingRows;
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
  const bounds = pageBounds(allRows.length);
  const firstPage = gridColumns !== 1 || bounds.index === 0;
  const lastPage = gridColumns !== 1 || bounds.index === bounds.pageCount - 1;
  pageFirst.setAttribute("aria-disabled", String(firstPage && atStart));
  pagePrevious.setAttribute("aria-disabled", String(gridColumns !== 1 || bounds.index === 0));
  pageNext.setAttribute("aria-disabled", String(gridColumns !== 1 || lastPage));
  pageLast.setAttribute("aria-disabled", String(lastPage && atEnd));
  pageNumber.textContent = allRows.length === 0 ? "" : String(bounds.index + 1);
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

function holdRepeatInterval(repeatCount) {
  return holdRepeatNumeratorMilliseconds / (Math.max(1, repeatCount) ** (2 / 3));
}

function installHoldPageButton(button, action) {
  let timerId = null;
  let repeatCount = 0;
  let pointerActive = false;

  const stopHold = () => {
    if (timerId !== null) {
      window.clearTimeout(timerId);
      timerId = null;
    }
    repeatCount = 0;
    pointerActive = false;
    button.classList.remove("is-holding");
  };
  const scheduleRepeat = () => {
    timerId = window.setTimeout(() => {
      timerId = null;
      if (!pointerActive || !action() || pageButtonDisabled(button)) {
        stopHold();
        return;
      }
      repeatCount += 1;
      scheduleRepeat();
    }, holdRepeatInterval(repeatCount));
  };

  button.addEventListener("pointerdown", (event) => {
    if (pageButtonDisabled(button) || !event.isPrimary || event.button !== 0) {
      return;
    }
    event.preventDefault();
    stopHold();
    pointerActive = true;
    button.classList.add("is-holding");
    try {
      button.setPointerCapture(event.pointerId);
    } catch (_error) {
      // Pointer capture is best-effort.
    }
    if (!action() || pageButtonDisabled(button)) {
      stopHold();
      return;
    }
    repeatCount = 1;
    scheduleRepeat();
  });
  window.addEventListener("pointerup", stopHold);
  window.addEventListener("pointercancel", stopHold);
  button.addEventListener("lostpointercapture", stopHold);
  window.addEventListener("blur", stopHold);
  button.addEventListener("click", (event) => {
    if (event.detail > 0) {
      event.preventDefault();
      return;
    }
    if (!pageButtonDisabled(button)) {
      action();
    }
  });
}

function highlightEncoder(name) {
  const encoder = encodersByName[name];
  applyPageMetadata(encoder.orderingTitle, encoder.favicon);
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

function buildRows(mappingRows, order) {
  if (order === "number") {
    mappingRows.sort((a, b) => a.n - b.n);
  }
  for (const mapping of mappingRows) {
    mapping.node = null;
    mapping.rendered = false;
  }
  return mappingRows;
}

function pagination(rowCount) {
  const pageCount = Math.max(1, Math.ceil(rowCount / maximumPageRows));
  return {
    pageCount,
    shortPageRows: Math.floor(rowCount / pageCount),
    longPageCount: rowCount % pageCount,
  };
}

function pageBounds(rowCount, page = currentPage) {
  const {pageCount, shortPageRows, longPageCount} = pagination(rowCount);
  const index = Math.max(0, Math.min(pageCount - 1, page));
  const start = index * shortPageRows + Math.min(index, longPageCount);
  const size = shortPageRows + (index < longPageCount ? 1 : 0);
  return {index, pageCount, start, end: start + size};
}

function pageForRow(rowCount, rowIndex) {
  if (rowCount === 0) {
    return 0;
  }
  const {pageCount, shortPageRows, longPageCount} = pagination(rowCount);
  const index = Math.max(0, Math.min(rowCount - 1, rowIndex));
  const longRows = (shortPageRows + 1) * longPageCount;
  if (index < longRows) {
    return Math.floor(index / (shortPageRows + 1));
  }
  return Math.min(pageCount - 1, longPageCount + Math.floor((index - longRows) / shortPageRows));
}

function rowsForLayout(states, columns) {
  if (columns !== 1) {
    return states;
  }
  const bounds = pageBounds(states.length);
  currentPage = bounds.index;
  return states.slice(bounds.start, bounds.end);
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

function globalScrollAnchor() {
  const anchor = scrollAnchor();
  if (anchor === null || gridColumns !== 1) {
    return anchor;
  }
  const bounds = pageBounds(allRows.length);
  if (anchor.kind === "top") {
    if (bounds.start === 0) {
      return anchor;
    }
    return {kind: "row", index: bounds.start, rowFraction: 0, scrollProgress: 0};
  }
  if (anchor.kind === "bottom") {
    if (bounds.end === allRows.length) {
      return anchor;
    }
    return {kind: "row", index: bounds.end - 1, rowFraction: 1, scrollProgress: 1};
  }
  return {...anchor, index: bounds.start + anchor.index};
}

function localizeAnchor(anchor, rowCount) {
  if (anchor === null) {
    currentPage = 0;
    return null;
  }
  if (anchor.kind === "top") {
    currentPage = 0;
    return anchor;
  }
  if (anchor.kind === "bottom") {
    currentPage = pagination(rowCount).pageCount - 1;
    return anchor;
  }
  currentPage = pageForRow(rowCount, anchor.index);
  const bounds = pageBounds(rowCount);
  return {...anchor, index: anchor.index - bounds.start};
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
  if (gridColumns !== 1 || allRows.length === 0) {
    return false;
  }
  const bounds = pageBounds(allRows.length, page);
  if (bounds.index === currentPage) {
    return false;
  }
  currentPage = bounds.index;
  const nextRows = allRows.slice(bounds.start, bounds.end);
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

function showLastPage() {
  const lastPage = pagination(allRows.length).pageCount - 1;
  if (!showPage(lastPage, {kind: "bottom"})) {
    scrollToY(maxScrollY());
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
  const latex = `${state.n} \\mapsto ${state.latex}`;
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
    const bundle = await encoderBundle(name);
    if (token !== loadToken) {
      return;
    }
    const mappingRows = parseRows(bundle);
    const anchor = currentEncoder === null ? null : scrollAnchor();
    const nextAllRows = buildRows(mappingRows, order);
    const nextRows = rowsForLayout(nextAllRows, configuredGridColumns());
    const nextLayout = gridLayout(nextRows);
    cancelRendering();
    allRows = nextAllRows;
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
installHoldPageButton(pagePrevious, () => showPage(currentPage - 1, {kind: "top"}));
installHoldPageButton(pageNext, () => showPage(currentPage + 1, {kind: "top"}));
installPageButton(pageLast, showLastPage);
pageNavigation.addEventListener("contextmenu", (event) => event.preventDefault(), {capture: true});
pageNavigation.addEventListener("selectstart", (event) => event.preventDefault(), {capture: true});
pageNavigation.addEventListener("touchstart", (event) => event.preventDefault(), {capture: true, passive: false});
updatePageNavigationLayout();
updatePageNavigation();
loadSelectedEncoder();
window.addEventListener("hashchange", loadSelectedEncoder);
window.addEventListener("scroll", () => {
  updatePageNavigation();
  scheduleRenderedRows();
}, {passive: true});
window.addEventListener("resize", () => {
  updatePageNavigationLayout();
  const nextColumns = configuredGridColumns();
  if (nextColumns !== gridColumns) {
    const globalAnchor = globalScrollAnchor();
    const anchor = nextColumns === 1 ? localizeAnchor(globalAnchor, allRows.length) : globalAnchor;
    const nextRows = rowsForLayout(allRows, nextColumns);
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
