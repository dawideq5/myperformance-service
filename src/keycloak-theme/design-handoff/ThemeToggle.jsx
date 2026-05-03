// Theme toggle button — sun/moon morph + the View Transitions ripple is
// kicked from MPTheme.toggle(). Designed to slot into the header next to
// the Cmd+K button.

const ThemeToggle = () => {
  const [theme, setTheme] = React.useState(() =>
    typeof window !== "undefined" ? (window.MPTheme?.current() || "dark") : "dark"
  );
  React.useEffect(() => {
    const onChange = (e) => setTheme(e.detail.theme);
    window.addEventListener("mp-theme-change", onChange);
    return () => window.removeEventListener("mp-theme-change", onChange);
  }, []);

  const handleClick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    window.MPTheme?.toggle(r.left + r.width / 2, r.top + r.height / 2);
  };

  return (
    <button
      type="button"
      className="mp-themetoggle"
      onClick={handleClick}
      aria-label={theme === "dark" ? "Przełącz na motyw jasny" : "Przełącz na motyw ciemny"}
      title={theme === "dark" ? "Motyw jasny" : "Motyw ciemny"}
    >
      <span className={"mp-themetoggle__icon mp-themetoggle__icon--sun" + (theme === "light" ? " is-active" : "")}>
        <Icon name="sun" size={18} strokeWidth={2} />
      </span>
      <span className={"mp-themetoggle__icon mp-themetoggle__icon--moon" + (theme === "dark" ? " is-active" : "")}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </span>
    </button>
  );
};

window.ThemeToggle = ThemeToggle;
