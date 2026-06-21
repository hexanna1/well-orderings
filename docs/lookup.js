import * as notations from "./notations/index.js";
import {
  applyPageMetadata, encoderPageTitle, encoders, encodersByName, populateEncoderNav,
} from "./encoders.js";
import {installHoldButton} from "./hold_button.js";
import {loadAdmissibleData, loadPrimeIndex} from "./natural_number_encoding.js";
import {renderLatex, shouldHandleAppClick} from "./page.js";

const COLLAPSING_NAMES = ["buchholz_1", "buchholz", "ebocf"];
void Promise.allSettled([loadPrimeIndex(), ...COLLAPSING_NAMES.map((name) => loadAdmissibleData(name))]);

await window.katexReady;

const DEFAULT_RANDOM_LIMIT = 10_000, UINT32_RANGE_SIZE = 0x1_0000_0000;
const pageLoaded = document.readyState === "complete"
  ? Promise.resolve()
  : new Promise((resolve) => window.addEventListener("load", resolve, {once: true}));

const nav = document.getElementById("nav");
populateEncoderNav(nav);
nav.insertAdjacentHTML(
  "beforeend",
  ' <label class="nav-toggle" aria-label="all naturals"><input id="all-naturals" type="checkbox" aria-keyshortcuts="a" disabled> <span class="full-label">all naturals</span><span class="short-label">all</span></label>',
);
const allNaturalsInput = document.getElementById("all-naturals");
const form = document.getElementById("lookup-form");
const navigationGroup = form.querySelector(".page-navigation-group");
const input = document.getElementById("lookup-number");
const firstNumberButton = document.getElementById("first-number");
const previousNumberButton = document.getElementById("previous-number");
const nextNumberButton = document.getElementById("next-number");
const lastNumberButton = document.getElementById("last-number");
const numberNavigationButtons = [firstNumberButton, previousNumberButton, nextNumberButton, lastNumberButton];
const randomButton = document.getElementById("random-number");
const randomLimitButtons = [...document.querySelectorAll("[data-limit]")];
const randomLimitGroup = document.querySelector(".lookup-random-limit");
const status = document.getElementById("lookup-status"), results = document.getElementById("lookup-results");

let currentEncoder, selectedNumber = null, primeIndex, numberEncoders, randomLimit, randomMaximumRank;

function updateNavigationLayout() {
  navigationGroup.style.width = `${nav.getBoundingClientRect().width}px`;
  nav.classList.add("ready");
  form.classList.add("ready");
}

updateNavigationLayout();

function encoderFromHash() {
  const name = window.location.hash.slice(1);
  if (Object.prototype.hasOwnProperty.call(encodersByName, name)) return encodersByName[name];
  if (name !== "") { window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`); }
  return encoders[0];
}

function selectEncoder() {
  currentEncoder = encoderFromHash();
  applyPageMetadata(encoderPageTitle(currentEncoder, "Lookup"), currentEncoder.favicon);
  for (const link of nav.querySelectorAll("a[data-encoder]")) {
    link.classList.toggle("active", link.dataset.encoder === currentEncoder.name);
  }
  if (selectedNumber !== null) show(selectedNumber);
}

function uniformRandomInteger(maximum) {
  const ceiling = Math.floor(UINT32_RANGE_SIZE / maximum) * maximum, sample = new Uint32Array(1);
  do {
    crypto.getRandomValues(sample);
  } while (sample[0] >= ceiling);
  return sample[0] % maximum + 1;
}

function parseNumber(text) {
  if (primeIndex === undefined || !/^\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n >= 1 && n <= primeIndex.maximum ? n : null;
}

function readInput() {
  const n = parseNumber(input.value);
  if (n === null) {
    input.setCustomValidity(`Enter a natural number from 1 through ${primeIndex.maximum.toLocaleString()}.`);
    input.reportValidity();
    return null;
  }
  input.setCustomValidity("");
  return n;
}

function applyNumberInput() {
  const n = readInput();
  if (n !== null && n !== selectedNumber) show(n);
}

function firstLookupNumber() { return allNaturalsInput.checked ? 1 : 2; }

function lastLookupNumber() {
  return allNaturalsInput.checked ? primeIndex.maximum : primeIndex.primeAtIndex(primeIndex.maximumRank);
}

function previousLookupNumber(n) {
  if (allNaturalsInput.checked) return n <= 1 ? null : n - 1;
  return primeIndex.previousPrime(n);
}

function nextLookupNumber(n) {
  if (allNaturalsInput.checked) return n >= primeIndex.maximum ? null : n + 1;
  return primeIndex.nextPrime(n);
}

function navigationNumber() { return parseNumber(input.value) ?? selectedNumber; }

function updateNumberNavigation() {
  const n = navigationNumber(), first = firstLookupNumber(), last = lastLookupNumber();
  firstNumberButton.setAttribute("aria-disabled", String(n === first));
  previousNumberButton.setAttribute("aria-disabled", String(n === null || n <= first));
  nextNumberButton.setAttribute("aria-disabled", String(n === null || n >= last));
  lastNumberButton.setAttribute("aria-disabled", String(n === last));
}

function surroundingNumbers(n) {
  const neighborsPerSide = 3, totalNeighbors = 2 * neighborsPerSide, preceding = [];
  let cursor = n;
  while (preceding.length < totalNeighbors) {
    cursor = previousLookupNumber(cursor);
    if (cursor === null) break;
    preceding.push(cursor);
  }

  const following = [];
  cursor = n;
  while (following.length < totalNeighbors) {
    cursor = nextLookupNumber(cursor);
    if (cursor === null) break;
    following.push(cursor);
  }

  let precedingCount = Math.min(neighborsPerSide, preceding.length);
  let followingCount = Math.min(neighborsPerSide, following.length);
  while (precedingCount + followingCount < totalNeighbors) {
    if (precedingCount < preceding.length) {
      precedingCount += 1;
    } else if (followingCount < following.length) {
      followingCount += 1;
    } else {
      break;
    }
  }
  return [...preceding.slice(0, precedingCount).reverse(), n, ...following.slice(0, followingCount)];
}

function renderResults() {
  const notation = notations[currentEncoder.name], numberEncoder = numberEncoders[currentEncoder.name];
  const fragment = document.createDocumentFragment();
  for (const n of surroundingNumbers(selectedNumber)) {
    const selected = n === selectedNumber, row = document.createElement("div");
    row.className = "lookup-result";

    const number = document.createElement(selected ? "span" : "button");
    number.className = "lookup-number";
    number.textContent = n.toLocaleString();
    if (selected) {
      number.classList.add("active");
      number.setAttribute("aria-current", "true");
    } else {
      number.type = "button";
      number.dataset.number = String(n);
    }

    const ordinal = document.createElement("span");
    ordinal.className = "lookup-ordinal";
    renderLatex(notation.toLatex(numberEncoder.ordinal(n)), ordinal);
    row.append(number, ordinal);
    fragment.append(row);
  }
  results.replaceChildren(fragment);
  results.hidden = false;
}

function show(n) {
  window.getSelection()?.removeAllRanges();
  selectedNumber = n;
  input.value = String(n);
  input.setCustomValidity("");
  renderResults();
  status.classList.add("lookup-announcement");
  status.textContent = `${currentEncoder.label} encoding of natural number ${n.toLocaleString()}`;
  updateNumberNavigation();
}

function showAdjacentNumber(step) {
  const n = navigationNumber();
  if (n === null) return false;
  const adjacent = step < 0 ? previousLookupNumber(n) : nextLookupNumber(n);
  if (adjacent === null) {
    updateNumberNavigation();
    return false;
  }
  show(adjacent);
  input.blur();
  return true;
}

function showEndpointNumber(n) { if (selectedNumber !== n || parseNumber(input.value) !== n) show(n); }

function showRandomNumber() {
  if (primeIndex === undefined) return;
  const random = uniformRandomInteger(allNaturalsInput.checked ? randomLimit : randomMaximumRank);
  const n = allNaturalsInput.checked ? random : primeIndex.primeAtIndex(random);
  show(n);
}

function selectRandomLimit(button) {
  randomLimit = Number(button.dataset.limit);
  const lastPrime = randomLimit === primeIndex.maximum
    ? primeIndex.primeAtIndex(primeIndex.maximumRank)
    : primeIndex.previousPrime(randomLimit + 1);
  randomMaximumRank = primeIndex.primeIndex(lastPrime);
  for (const candidate of randomLimitButtons) {
    const selected = candidate === button;
    candidate.classList.toggle("active", selected);
    candidate.setAttribute("aria-pressed", String(selected));
  }
}

function updateLookupMode() {
  const allNaturals = allNaturalsInput.checked, numberKind = allNaturals ? "natural number" : "prime";
  form.setAttribute("aria-label", allNaturals ? "Natural number navigation" : "Prime navigation");
  for (const [button, direction] of [
    [firstNumberButton, "First"],
    [previousNumberButton, "Previous"],
    [nextNumberButton, "Next"],
    [lastNumberButton, "Last"],
  ]) {
    button.setAttribute("aria-label", `${direction} ${numberKind}`);
  }
  randomLimitGroup.setAttribute("aria-label", `Random ${numberKind} limit`);
  for (const button of randomLimitButtons) {
    const limit = Number(button.dataset.limit).toLocaleString();
    button.title = `Random ${allNaturals ? "natural numbers" : "primes"} ≤ ${limit}`;
  }
  if (selectedNumber !== null) {
    renderResults();
    updateNumberNavigation();
  }
}

nav.addEventListener("click", (event) => {
  if (!shouldHandleAppClick(event)) return;
  const link = event.target.closest("a[data-encoder]");
  if (link === null || !nav.contains(link)) return;
  event.preventDefault();
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}${link.hash}`);
  selectEncoder();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  applyNumberInput();
});

input.addEventListener("change", applyNumberInput);

results.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-number]");
  if (button === null || !results.contains(button)) return;
  show(Number(button.dataset.number));
});

allNaturalsInput.addEventListener("change", updateLookupMode);
randomButton.addEventListener("click", showRandomNumber);
for (const button of randomLimitButtons) { button.addEventListener("click", () => selectRandomLimit(button)); }
firstNumberButton.addEventListener("click", () => showEndpointNumber(firstLookupNumber()));
lastNumberButton.addEventListener("click", () => showEndpointNumber(lastLookupNumber()));
window.addEventListener("hashchange", selectEncoder);
window.addEventListener("resize", updateNavigationLayout);
window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (
    event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey ||
    event.target === input || primeIndex === undefined ||
    (event.target === allNaturalsInput && key !== "a")
  ) {
    return;
  }
  if (key === "p" || key === "arrowleft") {
    event.preventDefault();
    showAdjacentNumber(-1);
  } else if (key === "n" || key === "arrowright") {
    event.preventDefault();
    showAdjacentNumber(1);
  } else if (key === "f") {
    event.preventDefault();
    showEndpointNumber(firstLookupNumber());
  } else if (key === "l") {
    event.preventDefault();
    showEndpointNumber(lastLookupNumber());
  } else if (key === "r") {
    event.preventDefault();
    showRandomNumber();
  } else if (key === "a") {
    event.preventDefault();
    allNaturalsInput.checked = !allNaturalsInput.checked;
    updateLookupMode();
  }
});

input.addEventListener("input", () => {
  input.setCustomValidity("");
  updateNumberNavigation();
});
installHoldButton(previousNumberButton, () => showAdjacentNumber(-1));
installHoldButton(nextNumberButton, () => showAdjacentNumber(1));
for (const button of numberNavigationButtons) {
  button.addEventListener("contextmenu", (event) => event.preventDefault());
  button.addEventListener("selectstart", (event) => event.preventDefault());
}
for (const button of [previousNumberButton, nextNumberButton]) {
  button.addEventListener("touchstart", (event) => event.preventDefault(), {passive: false});
}

async function initialize() {
  try {
    const [loadedPrimeIndex, ...loadedAdmissibleData] = await Promise.all([
      loadPrimeIndex(),
      ...COLLAPSING_NAMES.map((name) => loadAdmissibleData(name)),
    ]);
    await pageLoaded;
    primeIndex = loadedPrimeIndex;
    const admissibleDataByName = Object.fromEntries(
      COLLAPSING_NAMES.map((name, index) => [name, loadedAdmissibleData[index]]),
    );
    numberEncoders = Object.freeze(Object.fromEntries(
      Object.entries(notations).map(([name, notation]) => [
        name,
        notation.createEncoder(primeIndex, admissibleDataByName[name]),
      ]),
    ));
    input.maxLength = String(primeIndex.maximum).length;
    input.disabled = false;
    allNaturalsInput.disabled = false;
    for (const button of numberNavigationButtons) { button.disabled = false; }
    randomButton.disabled = false;
    for (const button of randomLimitButtons) { button.disabled = false; }
    selectRandomLimit(randomLimitButtons.find(
      (button) => Number(button.dataset.limit) === DEFAULT_RANDOM_LIMIT,
    ));
    showRandomNumber();
  } catch (error) {
    status.classList.remove("lookup-announcement");
    status.textContent = "Could not load the lookup data.";
    console.error(error);
  }
}

selectEncoder();
initialize();
