(() => {
  "use strict";

  const version = "0.18.4";
  const baseUrl = `https://cdn.jsdelivr.net/npm/katex@${version}/dist`;
  const loader = document.currentScript;

  const fontSizes = loader.dataset.fontSizes?.split(" ").filter(Boolean) ?? [];
  for (const size of fontSizes) {
    const preload = document.createElement("link");
    preload.rel = "preload";
    preload.href = `${baseUrl}/fonts/KaTeX_Size${size}-Regular.woff2`;
    preload.as = "font";
    preload.type = "font/woff2";
    preload.crossOrigin = "anonymous";
    document.head.append(preload);
  }

  const stylesheetReady = new Promise((resolve) => {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = `${baseUrl}/katex.min.css`;
    stylesheet.addEventListener("load", resolve, {once: true});
    stylesheet.addEventListener("error", resolve, {once: true});
    document.head.append(stylesheet);
  });

  function loadScript(source) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.addEventListener("load", resolve, {once: true});
      script.addEventListener("error", reject, {once: true});
      document.head.append(script);
    });
  }

  let scriptsReady = loadScript(`${baseUrl}/katex.min.js`);
  if (loader.hasAttribute("data-auto-render")) {
    scriptsReady = scriptsReady.then(
      () => loadScript(`${baseUrl}/contrib/auto-render.min.js`),
    );
  }
  window.katexReady = Promise.all([stylesheetReady, scriptsReady]).catch(() => {});

  if (loader.hasAttribute("data-auto-render")) {
    const documentReady = document.readyState === "loading"
      ? new Promise((resolve) => document.addEventListener(
        "DOMContentLoaded",
        resolve,
        {once: true},
      ))
      : Promise.resolve();
    Promise.all([window.katexReady, documentReady]).then(() => {
      if (typeof window.renderMathInElement !== "function") {
        return;
      }
      window.renderMathInElement(document.body, {
        delimiters: [{left: "\\(", right: "\\)", display: false}],
        throwOnError: false,
      });
    }).catch((error) => console.error(error));
  }
})();
