"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type ChangeEvent,
  type CSSProperties,
  type InputHTMLAttributes,
} from "react";
import { X } from "lucide-react";

/**
 * Wave 21 / Faza 1E — reusable input z krzyżykiem "wyczyść" przy
 * nieobowiązkowych polach. Ikona X pojawia się tylko gdy `value`
 * niepuste, klikalna, klawiatury-dostępna (Enter/Space) i nie traci
 * fokusu przy MouseDown (preventDefault), przez co nie zaburza tab order.
 *
 * Użycie:
 *   <ClearableInput value={x} onValueChange={setX} placeholder="…" optional />
 *
 * Komponent przekazuje wszystkie standardowe `<input>` propsy. Dodatkowe:
 *   - `onValueChange(string)` — wygodny handler bez wyciągania `e.target.value`,
 *   - `optional` — kontrolka kosmetyczna; gdy false, krzyżyk się nie rysuje
 *     (wymuszone pola nie powinny być czyszczalne jednym kliknięciem),
 *   - `clearAriaLabel` — podpowiedź a11y dla przycisku (default „Wyczyść pole”).
 *
 * A11y:
 *   - przycisk ma `aria-label`; gdy `aria-label` na inpucie istnieje,
 *     budujemy podpowiedź "Wyczyść pole {label}",
 *   - po kliknięciu fokus wraca do inputa,
 *   - przycisk pomijany w tab order (`tabIndex=-1`) — niska wartość biz,
 *     dostęp przez klawiaturę inputa: Esc/Backspace itp. nadal działają.
 */
export interface ClearableInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  /** Wartość kontrolowana (string). */
  value: string;
  /** Handler wartości (wygodny shortcut zamiast onChange). */
  onValueChange: (value: string) => void;
  /** Standardowy onChange — opcjonalny, przekazany dla zgodności z React. */
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  /** Czy pole jest opcjonalne (steruje wyświetlaniem krzyżyka). Domyślnie true. */
  optional?: boolean;
  /** Etykieta a11y dla przycisku „Wyczyść”. */
  clearAriaLabel?: string;
  /** Inline style przekazywany do wrappera + inputa. */
  containerStyle?: CSSProperties;
  /** Klasa wrappera (otacza input + button). */
  containerClassName?: string;
}

export const ClearableInput = forwardRef<HTMLInputElement, ClearableInputProps>(
  function ClearableInput(
    {
      value,
      onValueChange,
      onChange,
      optional = true,
      clearAriaLabel,
      containerStyle,
      containerClassName,
      className,
      style,
      disabled,
      readOnly,
      "aria-label": ariaLabel,
      ...rest
    },
    forwardedRef,
  ) {
    const innerRef = useRef<HTMLInputElement | null>(null);
    useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement);

    const showClear =
      optional && !disabled && !readOnly && value !== undefined && value !== "";

    const handleClear = useCallback(() => {
      onValueChange("");
      // Po wyczyszczeniu zwracamy fokus do inputa — UX: serwisant może
      // od razu wpisać nową wartość bez ruchu myszą.
      requestAnimationFrame(() => innerRef.current?.focus());
    }, [onValueChange]);

    const handleChange = useCallback(
      (e: ChangeEvent<HTMLInputElement>) => {
        onValueChange(e.target.value);
        onChange?.(e);
      },
      [onChange, onValueChange],
    );

    const buttonAriaLabel =
      clearAriaLabel ??
      (typeof ariaLabel === "string" && ariaLabel
        ? `Wyczyść pole ${ariaLabel}`
        : "Wyczyść pole");

    return (
      <div
        className={`relative ${containerClassName ?? ""}`.trim()}
        style={containerStyle}
      >
        <input
          {...rest}
          ref={innerRef}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          readOnly={readOnly}
          aria-label={ariaLabel}
          className={className}
          // Right padding gdy pokazujemy krzyżyk — żeby tekst nie wlatywał pod ikonę.
          style={{
            ...style,
            paddingRight: showClear
              ? "2rem"
              : (style as CSSProperties | undefined)?.paddingRight,
          }}
        />
        {showClear && (
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => {
              // Nie odbieraj fokusu inputa — wsparcie keyboard flow.
              e.preventDefault();
            }}
            onClick={handleClear}
            aria-label={buttonAriaLabel}
            className="absolute top-1/2 -translate-y-1/2 right-1.5 p-1 rounded-md transition-colors hover:bg-white/10 focus:outline-none focus:ring-2"
            style={{
              color: "var(--text-muted)",
            }}
            title="Wyczyść"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  },
);
