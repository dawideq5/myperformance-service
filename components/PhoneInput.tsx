"use client";

import { useState, useEffect } from "react";
import { ChevronDown } from "lucide-react";

// Country codes with flags
const COUNTRIES = [
  { code: "PL", name: "Polska", prefix: "+48", flag: "🇵🇱" },
  { code: "US", name: "Stany Zjednoczone", prefix: "+1", flag: "🇺🇸" },
  { code: "GB", name: "Wielka Brytania", prefix: "+44", flag: "🇬🇧" },
  { code: "DE", name: "Niemcy", prefix: "+49", flag: "🇩🇪" },
  { code: "FR", name: "Francja", prefix: "+33", flag: "🇫🇷" },
  { code: "IT", name: "Włochy", prefix: "+39", flag: "🇮🇹" },
  { code: "ES", name: "Hiszpania", prefix: "+34", flag: "🇪🇸" },
  { code: "NL", name: "Holandia", prefix: "+31", flag: "🇳🇱" },
  { code: "BE", name: "Belgia", prefix: "+32", flag: "🇧🇪" },
  { code: "CH", name: "Szwajcaria", prefix: "+41", flag: "🇨🇭" },
  { code: "AT", name: "Austria", prefix: "+43", flag: "🇦🇹" },
  { code: "CZ", name: "Czechy", prefix: "+420", flag: "🇨🇿" },
  { code: "SK", name: "Słowacja", prefix: "+421", flag: "🇸🇰" },
  { code: "SE", name: "Szwecja", prefix: "+46", flag: "🇸🇪" },
  { code: "NO", name: "Norwegia", prefix: "+47", flag: "🇳🇴" },
  { code: "DK", name: "Dania", prefix: "+45", flag: "🇩🇰" },
  { code: "FI", name: "Finlandia", prefix: "+358", flag: "🇫🇮" },
  { code: "LT", name: "Litwa", prefix: "+370", flag: "🇱🇹" },
  { code: "LV", name: "Łotwa", prefix: "+371", flag: "🇱🇻" },
  { code: "EE", name: "Estonia", prefix: "+372", flag: "🇪🇪" },
  { code: "UA", name: "Ukraina", prefix: "+380", flag: "🇺🇦" },
  { code: "RO", name: "Rumunia", prefix: "+40", flag: "🇷🇴" },
  { code: "HU", name: "Węgry", prefix: "+36", flag: "🇭🇺" },
  { code: "BG", name: "Bułgaria", prefix: "+359", flag: "🇧🇬" },
  { code: "HR", name: "Chorwacja", prefix: "+385", flag: "🇭🇷" },
  { code: "SI", name: "Słowenia", prefix: "+386", flag: "🇸🇮" },
  { code: "GR", name: "Grecja", prefix: "+30", flag: "🇬🇷" },
  { code: "PT", name: "Portugalia", prefix: "+351", flag: "🇵🇹" },
  { code: "IE", name: "Irlandia", prefix: "+353", flag: "🇮🇪" },
  { code: "IS", name: "Islandia", prefix: "+354", flag: "🇮🇸" },
  { code: "MT", name: "Malta", prefix: "+356", flag: "🇲🇹" },
  { code: "CY", name: "Cypr", prefix: "+357", flag: "🇨🇾" },
  { code: "LU", name: "Luksemburg", prefix: "+352", flag: "🇱🇺" },
  { code: "LI", name: "Liechtenstein", prefix: "+423", flag: "🇱🇮" },
  { code: "MC", name: "Monako", prefix: "+377", flag: "🇲🇨" },
  { code: "AL", name: "Albania", prefix: "+355", flag: "🇦🇱" },
  { code: "RS", name: "Serbia", prefix: "+381", flag: "🇷🇸" },
  { code: "ME", name: "Czarnogóra", prefix: "+382", flag: "🇲🇪" },
  { code: "MK", name: "Macedonia", prefix: "+389", flag: "🇲🇰" },
  { code: "BA", name: "Bośnia", prefix: "+387", flag: "🇧🇦" },
  { code: "TR", name: "Turcja", prefix: "+90", flag: "🇹🇷" },
];

interface PhoneInputProps {
  value: string;
  prefix: string;
  onChange: (value: string) => void;
  onPrefixChange: (prefix: string) => void;
  disabled?: boolean;
}

export function PhoneInput({ value, prefix, onChange, onPrefixChange, disabled }: PhoneInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedCountry = COUNTRIES.find(c => c.prefix === prefix) || COUNTRIES[0];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setIsOpen(false);
    if (isOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (country: typeof COUNTRIES[0]) => {
    onPrefixChange(country.prefix);
    setIsOpen(false);
  };

  return (
    <div className="flex gap-2">
      {/* Country selector with flag */}
      <div className="relative">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          disabled={disabled}
          className="flex items-center gap-2 px-3 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50 min-w-[100px]"
        >
          <span className="text-xl">{selectedCountry.flag}</span>
          <span className="text-sm font-medium">{selectedCountry.prefix}</span>
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
        </button>

        {/* Dropdown */}
        {isOpen && (
          <div
            className="absolute z-50 top-full left-0 mt-1 w-64 max-h-64 overflow-y-auto bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="py-1">
              {COUNTRIES.map((country) => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => handleSelect(country)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-[var(--bg-main)] transition-colors ${
                    country.prefix === prefix ? "bg-[var(--accent)]/10" : ""
                  }`}
                >
                  <span className="text-xl">{country.flag}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-main)] truncate">{country.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">{country.prefix}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Phone number input */}
      <input
        type="tel"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d\s-]/g, ""))}
        placeholder="123 456 789"
        disabled={disabled}
        className="flex-1 px-4 py-3 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl text-[var(--text-main)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
      />
    </div>
  );
}
