(() => {
  "use strict";

  const version = "0.19.1", baseUrl = `https://cdn.jsdelivr.net/npm/katex@${version}/dist`;
  const loader = document.currentScript;

  function loadElement(element) {
    return new Promise((resolve, reject) => {
      element.addEventListener("load", resolve, {once: true});
      element.addEventListener("error", () => {
        element.remove();
        reject(new Error(`Could not load ${element.src || element.href}`));
      }, {once: true});
      document.head.append(element);
    });
  }

  function loadStylesheet() {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `${baseUrl}/katex.min.css`;
    return loadElement(link);
  }

  function loadScript(filename) {
    const script = document.createElement("script");
    script.src = `${baseUrl}/${filename}`;
    return loadElement(script);
  }

  if (loader.hasAttribute("data-auto-render")) {
    const documentReady = document.readyState === "loading"
      ? new Promise((resolve) => document.addEventListener("DOMContentLoaded", resolve, {once: true}))
      : Promise.resolve();
    const scripts = loadScript("katex.min.js").then(() => loadScript("contrib/auto-render.min.js"));
    Promise.all([documentReady, scripts, loadStylesheet().catch(console.error)]).then(() => {
      window.renderMathInElement(document.body, {
        delimiters: [{left: "\\(", right: "\\)", display: false}],
        throwOnError: false,
      });
    }).catch(console.error);
    return;
  }

  async function loadFont(family, style = "Regular") {
    const url = `${baseUrl}/fonts/${family}-${style}.woff2`;
    const face = new FontFace(family, `url("${url}")`, {style: style === "Italic" ? "italic" : "normal"});
    document.fonts.add(await face.load());
  }

  const pending = new Set([
    loadStylesheet,
    async () => {
      await loadScript("katex.min.js");
      if (typeof window.katex?.render !== "function") throw new Error("Could not initialize KaTeX.");
    },
    () => loadFont("KaTeX_Main"),
    () => loadFont("KaTeX_Math", "Italic"),
  ]);
  for (const size of loader.dataset.fontSizes.split(" ")) pending.add(() => loadFont(`KaTeX_Size${size}`));

  function start() {
    return Promise.allSettled([...pending].map(async (load) => {
      await load();
      pending.delete(load);
    }));
  }

  let loading = start();
  window.loadKatex = async () => {
    const results = await (loading ??= start());
    const failure = results.find(({status}) => status === "rejected");
    if (failure) {
      loading = undefined;
      throw failure.reason;
    }
  };
})();
