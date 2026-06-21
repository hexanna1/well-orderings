export const encoders = [
  {name: "cantor", label: "cantor", shortLabel: "ε₀", displayName: "Cantor"},
  {name: "binary", label: "binary", shortLabel: "Γ₀", displayName: "Binary Veblen"},
  {name: "finitary", label: "finitary", shortLabel: "SVO", displayName: "Finitary Veblen"},
  {name: "transfinitary", label: "transfinitary", shortLabel: "LVO", displayName: "Transfinitary Veblen"},
  {name: "buchholz_1", label: "buchholz₁", shortLabel: "BHO", displayName: "Buchholz₁"},
  {name: "buchholz", label: "buchholz", shortLabel: "BO", displayName: "Buchholz"},
  {name: "ebocf", label: "ebocf", shortLabel: "ψ₀(Λ)", displayName: "Extended Buchholz"},
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

export function applyPageMetadata(title, favicon) {
  document.title = title;
  document.querySelector('link[rel="icon"]').href = favicon;
}
