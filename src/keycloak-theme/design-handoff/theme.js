// Theme controller — manages dark/light + smooth circular reveal.
// Uses View Transitions API where available (Chromium); falls back to
// a CSS class crossfade everywhere else. Persists to localStorage.

window.MPTheme = (function () {
  const KEY = "mp-theme";
  const root = document.documentElement;

  function getStored() {
    try { return localStorage.getItem(KEY); } catch (_) { return null; }
  }
  function setStored(v) {
    try { localStorage.setItem(KEY, v); } catch (_) {}
  }
  function current() {
    return root.getAttribute("data-theme") || "dark";
  }
  function applyTheme(t, opts = {}) {
    root.setAttribute("data-theme", t);
    root.classList.toggle("dark", t === "dark");
    root.classList.toggle("light", t === "light");
    setStored(t);
    if (!opts.silent) {
      window.dispatchEvent(new CustomEvent("mp-theme-change", { detail: { theme: t } }));
    }
  }

  // Initial — read storage, default to dark, suppress crossfade for first paint.
  function init() {
    root.classList.add("no-theme-transition");
    applyTheme(getStored() || "dark", { silent: true });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove("no-theme-transition"));
    });
  }

  // Toggle with circular-reveal centred on the click coords.
  function toggle(originX, originY) {
    const next = current() === "dark" ? "light" : "dark";

    // Set CSS variables that the @keyframes mp-reveal-clip uses.
    if (typeof originX === "number" && typeof originY === "number") {
      root.style.setProperty("--mp-cx", originX + "px");
      root.style.setProperty("--mp-cy", originY + "px");
    } else {
      root.style.setProperty("--mp-cx", "50%");
      root.style.setProperty("--mp-cy", "0%");
    }

    if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.startViewTransition(() => applyTheme(next));
    } else {
      applyTheme(next);
    }
  }

  init();

  return { toggle, current, set: applyTheme };
})();
