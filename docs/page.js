export function shouldHandleAppClick(event) {
  return !(
    event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey ||
    event.metaKey || event.shiftKey
  );
}

export function renderLatex(latex, node, options = {}) {
  if (window.katex && typeof window.katex.render === "function") {
    window.katex.render(latex, node, {output: "html", strict: "ignore", throwOnError: false, ...options});
    return true;
  }
  node.textContent = latex;
  return false;
}
