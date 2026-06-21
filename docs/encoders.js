export const encoders = [
  {
    name: "cantor",
    label: "cantor [ε₀]",
    shortLabel: "ε₀",
    favicon: "favicons/cantor.svg",
    explorerTitle: "Cantor Explorer",
    orderingTitle: "Cantor Well-Ordering",
  },
  {
    name: "binary",
    label: "binary [Γ₀]",
    shortLabel: "Γ₀",
    favicon: "favicons/binary.svg",
    explorerTitle: "Binary Veblen Explorer",
    orderingTitle: "Binary Veblen Well-Ordering",
  },
  {
    name: "finitary",
    label: "finitary [SVO]",
    shortLabel: "SVO",
    favicon: "favicons/finitary.svg",
    explorerTitle: "Finitary Veblen Explorer",
    orderingTitle: "Finitary Veblen Well-Ordering",
  },
  {
    name: "transfinitary",
    label: "transfinitary [LVO]",
    shortLabel: "LVO",
    favicon: "favicons/transfinitary.svg",
    explorerTitle: "Transfinitary Veblen Explorer",
    orderingTitle: "Transfinitary Veblen Well-Ordering",
  },
  {
    name: "buchholz_1",
    label: "buchholz₁ [BHO]",
    shortLabel: "BHO",
    favicon: "favicons/buchholz_1.svg",
    explorerTitle: "Buchholz₁ Explorer",
    orderingTitle: "Buchholz₁ Well-Ordering",
  },
  {
    name: "buchholz",
    label: "buchholz [BO]",
    shortLabel: "BO",
    favicon: "favicons/buchholz.svg",
    explorerTitle: "Buchholz Explorer",
    orderingTitle: "Buchholz Well-Ordering",
  },
  {
    name: "ebocf",
    label: "ebocf [ψ₀(Λ)]",
    shortLabel: "ψ₀(Λ)",
    favicon: "favicons/ebocf.svg",
    explorerTitle: "Extended Buchholz Explorer",
    orderingTitle: "Extended Buchholz Well-Ordering",
  },
];

export const encodersByName = Object.fromEntries(
  encoders.map((encoder) => [encoder.name, encoder]),
);

export function applyPageMetadata(title, favicon) {
  document.title = title;
  document.querySelector('link[rel="icon"]').href = favicon;
}
