/* Explicit locale routes take priority; a saved choice redirects only the English entry points. */
(() => {
  const preferenceKey = "cuberence-marketing-language";
  try {
    const selected = window.localStorage.getItem(preferenceKey);
    const path = window.location.pathname;
    if (selected === "fr" && document.documentElement.lang === "en") {
      const isHome = path === "/" || path === "/index.html";
      const isAbout = path === "/about/" || path === "/about" || path === "/about/index.html";
      if (isHome || isAbout) {
        window.location.replace((isAbout ? "/fr/about/" : "/fr/") + window.location.search + window.location.hash);
        return;
      }
    }
  } catch (_) {
    // Private browsing may restrict storage; both languages remain accessible.
  }
  document.addEventListener("click", (event) => {
    const target = event.target;
    const choice = target && target.closest ? target.closest("a[data-language]") : null;
    if (!choice) return;
    const language = choice.getAttribute("data-language");
    if (language === "en" || language === "fr") {
      try { window.localStorage.setItem(preferenceKey, language); } catch (_) {}
    }
  }, true);
})();
