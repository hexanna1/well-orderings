export const encoders = [
  {
    name: "cantor",
    label: "cantor",
    shortLabel: "ε₀",
    displayName: "Cantor",
    favicon: "favicons/cantor.svg",
  },
  {
    name: "binary",
    label: "binary",
    shortLabel: "Γ₀",
    displayName: "Binary Veblen",
    favicon: "favicons/binary.svg",
  },
  {
    name: "finitary",
    label: "finitary",
    shortLabel: "SVO",
    displayName: "Finitary Veblen",
    favicon: "favicons/finitary.svg",
  },
  {
    name: "transfinitary",
    label: "transfinitary",
    shortLabel: "LVO",
    displayName: "Transfinitary Veblen",
    favicon: "favicons/transfinitary.svg",
  },
  {
    name: "buchholz_1",
    label: "buchholz₁",
    shortLabel: "BHO",
    displayName: "Buchholz₁",
    favicon: "favicons/buchholz_1.svg",
  },
  {
    name: "buchholz",
    label: "buchholz",
    shortLabel: "BO",
    displayName: "Buchholz",
    favicon: "favicons/buchholz.svg",
  },
  {
    name: "ebocf",
    label: "ebocf",
    shortLabel: "ψ₀(Λ)",
    displayName: "Extended Buchholz",
    favicon: "favicons/ebocf.svg",
  },
];

export function fullEncoderLabel({label, shortLabel}) {
  return `${label} [${shortLabel}]`;
}

export function encoderPageTitle({displayName}, pageName) {
  return `${displayName} ${pageName}`;
}

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

export const encodersByName = Object.fromEntries(
  encoders.map((encoder) => [encoder.name, encoder]),
);

export function applyPageMetadata(title, favicon) {
  document.title = title;
  document.querySelector('link[rel="icon"]').href = favicon;
}
