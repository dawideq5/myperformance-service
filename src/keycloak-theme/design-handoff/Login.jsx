// Login screen — minimalistyczny, single-card. Wordmark MyPerformance,
// Google SSO + form. Bez panelu hero, bez branding-pillaru. Działa w obu motywach.

const GOOGLE_LOGO = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.61 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.39-3.917z"/>
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
  </svg>
);

const Login = ({ onSubmit, onCancel }) => {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setSubmitting(true);
    setTimeout(() => { setSubmitting(false); onSubmit && onSubmit(); }, 900);
  };

  return (
    <div className="mp-login">
      <div className="mp-login__bg" aria-hidden="true" />
      <div className="mp-login__grid" aria-hidden="true" />

      <div className="mp-login__topbar">
        {onCancel && (
          <button type="button" className="mp-login__back" onClick={onCancel}>
            <Icon name="arrowLeft" size={14} />
            Wróć
          </button>
        )}
        <ThemeToggle />
      </div>

      <form className="mp-login__card mp-enter" onSubmit={handleSubmit}>
        <div className="mp-login__brandhead">
          <h1 className="mp-login__brand">MyPerformance</h1>
        </div>

        <div className="mp-login__panelhead">
          <h2 className="mp-login__title">Zaloguj się</h2>
          <p className="mp-login__sub">Użyj swojego konta firmowego, aby przejść do swoich aplikacji.</p>
        </div>

        <button type="button" className="mp-btn mp-btn--secondary mp-btn--block mp-login__sso">
          {GOOGLE_LOGO}
          <span>Kontynuuj z kontem Google</span>
        </button>

        <div className="mp-login__divider"><span>lub</span></div>

        <div className="mp-login__field">
          <label>Email</label>
          <div className="mp-login__ctrl">
            <Icon name="mail" size={16} />
            <input type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)}
                   placeholder="ty@caseownia.pl" />
          </div>
        </div>

        <div className="mp-login__field">
          <div className="mp-login__label-row">
            <label>Hasło</label>
            <a href="#" className="mp-login__forgot">Nie pamiętasz hasła?</a>
          </div>
          <div className="mp-login__ctrl">
            <Icon name="keyRound" size={16} />
            <input type={showPassword ? "text" : "password"} required value={password}
                   onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            <button type="button" className="mp-login__eye" aria-label="Pokaż hasło"
                    onClick={() => setShowPassword(s => !s)}>
              <Icon name={showPassword ? "x" : "info"} size={14} />
            </button>
          </div>
        </div>

        <label className="mp-login__remember">
          <input type="checkbox" defaultChecked /> <span>Zaufaj temu urządzeniu na 30 dni</span>
        </label>

        <button type="submit" className="mp-btn mp-btn--primary mp-btn--block mp-btn--lg" disabled={submitting}>
          {submitting && <Icon name="loader" size={16} className="mp-spin" />}
          <span>{submitting ? "Logowanie…" : "Zaloguj się"}</span>
          {!submitting && <Icon name="arrowRight" size={16} />}
        </button>
      </form>
    </div>
  );
};

window.Login = Login;
