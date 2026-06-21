import {loadAdmissibleData, loadPrimeIndex} from "./natural_number_encoding.js";

export const encoders = [
  {name: "cantor", label: "cantor", shortLabel: "ε₀", displayName: "Cantor"},
  {name: "binary", label: "binary", shortLabel: "Γ₀", displayName: "Binary Veblen"},
  {name: "finitary", label: "finitary", shortLabel: "SVO", displayName: "Finitary Veblen"},
  {name: "transfinitary", label: "transfinitary", shortLabel: "LVO", displayName: "Transfinitary Veblen"},
  {name: "buchholz_1", label: "buchholz₁", shortLabel: "BHO", displayName: "Buchholz₁", admissibilityIndex: true},
  {name: "buchholz", label: "buchholz", shortLabel: "BO", displayName: "Buchholz", admissibilityIndex: true},
  {name: "ebocf", label: "ebocf", shortLabel: "ψ₀(Λ)", displayName: "Extended Buchholz", admissibilityIndex: true},
].map((encoder) => ({...encoder, favicon: `favicons/${encoder.name}.svg`}));

export function fullEncoderLabel({label, shortLabel}) { return `${label} [${shortLabel}]`; }

export function encoderPageTitle({displayName}, pageName) { return `${displayName} ${pageName}`; }

export function populateEncoderNav(nav) {
  nav.innerHTML = encoders.map((encoder) => {
    const fullLabel = fullEncoderLabel(encoder);
    return (
      `<a href="#${encoder.name}" data-encoder="${encoder.name}" aria-label="${fullLabel}">` +
      `<span class="full-label">${fullLabel}</span>` +
      `<span class="short-label">${encoder.shortLabel}</span></a>`
    );
  }).join(" ");
  nav.insertAdjacentHTML("beforeend", ' <a href="index.html">about</a>');
}

export const encodersByName = Object.fromEntries(encoders.map((encoder) => [encoder.name, encoder]));

const faviconUrls = new Map();

async function loadFavicon(favicon) {
  const response = await fetch(favicon);
  if (!response.ok) throw new Error(`Could not fetch ${favicon}`);
  faviconUrls.set(favicon, URL.createObjectURL(await response.blob()));
}

async function waitForRetry(status, offerReload) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Retry";
  status.textContent = "Could not load all page resources. ";
  status.append(button);
  if (offerReload) {
    const reload = document.createElement("button");
    reload.type = "button";
    reload.textContent = "Reload page";
    reload.addEventListener("click", () => window.location.reload());
    status.append(" ", reload);
  }
  await new Promise((resolve) => button.addEventListener("click", resolve, {once: true}));
}

export async function prepareToolPage(status, loadData, sharedLoads = []) {
  const loadingText = status.textContent;
  const entries = {}, pending = new Set([() => window.loadKatex(), ...sharedLoads]);
  let retried = false;
  for (const {name, favicon} of encoders) {
    const entry = entries[name] = {};
    let attempt = 0;
    pending.add(async () => {
      // A fresh URL allows a retry even when the browser remembers a failed import.
      const suffix = attempt === 0 ? "" : `?retry=${attempt}`;
      attempt += 1;
      entry.notation = await import(`./notations/${name}.js${suffix}`);
    });
    pending.add(async () => { entry.data = await loadData(name); });
    pending.add(() => loadFavicon(favicon));
  }

  while (pending.size > 0) {
    const results = await Promise.allSettled([...pending].map(async (load) => {
      await load();
      pending.delete(load);
    }));
    if (pending.size > 0) {
      console.error(results.find(({status}) => status === "rejected").reason);
      await waitForRetry(status, retried || typeof window.loadKatex !== "function");
      retried = true;
      status.textContent = loadingText;
    }
  }
  return entries;
}

export async function prepareNumberEncoders(status) {
  let primeIndex;
  const entries = await prepareToolPage(
    status,
    (name) => encodersByName[name].admissibilityIndex ? loadAdmissibleData(name) : undefined,
    [async () => { primeIndex = await loadPrimeIndex(); }],
  );
  for (const entry of Object.values(entries)) {
    entry.primeIndex = primeIndex;
    entry.numberEncoder = entry.notation.createEncoder(primeIndex, entry.data);
  }
  return entries;
}

export function applyPageMetadata(title, favicon) {
  document.title = title;
  const url = faviconUrls.get(favicon);
  if (url !== undefined) document.querySelector('link[rel="icon"]').href = url;
}
