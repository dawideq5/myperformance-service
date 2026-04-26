/**
 * Theme jest fixed na ciemny — light theme został usunięty (decyzja
 * produktowa: enterprise-grade ciemny look, mniej decyzji estetycznych
 * dla usera, mniej kodu do utrzymania). Komponent zostawiony jako stub
 * żeby nie zerwać call-site'ów (AppHeader importuje ThemeToggle).
 */
export function ThemeToggle({ className: _className }: { className?: string }) {
  return null;
}
