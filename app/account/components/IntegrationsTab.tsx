"use client";

import { useState } from "react";
import {
  Globe, AlertCircle, CheckCircle2, Loader2, ChevronRight, X,
  ShieldCheck, Calendar, Tag, Info, Settings,
  Shield as ShieldIcon,
} from "lucide-react";

interface Props {
  googleConnected: boolean;
  googleError: string | null;
  googleSuccess: string | null;
  connectingGoogle: boolean;
  googleModalOpen: boolean;
  googleFeatureEmail: boolean;
  googleFeatureCalendar: boolean;
  googleFeatureGmail: boolean;
  setGoogleModalOpen: (open: boolean) => void;
  setGoogleFeatureEmail: (v: boolean) => void;
  setGoogleFeatureCalendar: (v: boolean) => void;
  setGoogleFeatureGmail: (v: boolean) => void;
  onConnectGoogle: () => void;
  onDisconnectGoogle: () => void;
  onSubmitGoogleLink: () => void;
}

export function IntegrationsTab({
  googleConnected, googleError, googleSuccess, connectingGoogle,
  googleModalOpen, googleFeatureEmail, googleFeatureCalendar, googleFeatureGmail,
  setGoogleModalOpen, setGoogleFeatureEmail, setGoogleFeatureCalendar, setGoogleFeatureGmail,
  onConnectGoogle, onDisconnectGoogle, onSubmitGoogleLink,
}: Props) {
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  const handleDisconnect = () => {
    if (confirmingDisconnect) {
      setConfirmingDisconnect(false);
      onDisconnectGoogle();
    } else {
      setConfirmingDisconnect(true);
    }
  };

  return (
    <div className="space-y-6 animate-tab-in">
      <div className="bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${googleConnected ? "bg-green-500/10" : "bg-[var(--accent)]/10"}`}>
              <Globe className={`w-6 h-6 ${googleConnected ? "text-green-500" : "text-[var(--accent)]"}`} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-main)]">Konto Google</h2>
              <p className="text-sm text-[var(--text-muted)]">
                {googleConnected ? <span className="text-green-500">Połączone</span> : "Niepołączone"}
              </p>
            </div>
          </div>

          {!googleConnected ? (
            <button
              onClick={onConnectGoogle}
              disabled={connectingGoogle}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:bg-[var(--accent)]/90 transition-colors disabled:opacity-50"
            >
              {connectingGoogle ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              Połącz
            </button>
          ) : confirmingDisconnect ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">Na pewno?</span>
              <button
                onClick={handleDisconnect}
                disabled={connectingGoogle}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-500 text-white rounded-xl text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                Tak, odłącz
              </button>
              <button
                onClick={() => setConfirmingDisconnect(false)}
                className="inline-flex items-center gap-1.5 px-3 py-2 border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-xl text-xs font-medium hover:text-[var(--text-main)] transition-colors"
              >
                Anuluj
              </button>
            </div>
          ) : (
            <button
              onClick={handleDisconnect}
              disabled={connectingGoogle}
              className="inline-flex items-center gap-2 px-4 py-2 border border-red-500/30 text-red-500 rounded-xl text-sm font-medium hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              {connectingGoogle ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              Odłącz
            </button>
          )}
        </div>

        {googleError && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <div className="flex items-center gap-2 text-red-500 mb-2">
              <AlertCircle className="w-5 h-5" />
              <span className="font-medium">Błąd połączenia</span>
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              {googleError === "access_denied" && "Odmówiono dostępu. Spróbuj ponownie lub skontaktuj się z administratorem."}
              {googleError === "link_not_completed" && "Keycloak nie potwierdził powiązania konta Google. Spróbuj ponownie."}
              {googleError === "internal_error" && "Wystąpił wewnętrzny błąd. Spróbuj ponownie później."}
              {!["access_denied", "link_not_completed", "internal_error"].includes(googleError) && `Błąd: ${googleError}`}
            </p>
          </div>
        )}

        {googleSuccess && (
          <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
            <div className="flex items-center gap-2 text-green-500 mb-2">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">Połączenie zakończone powodzeniem</span>
            </div>
            <p className="text-sm text-[var(--text-muted)]">{googleSuccess}</p>
          </div>
        )}

        {googleConnected && !googleSuccess && (
          <div className="mb-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
            <div className="flex items-center gap-2 text-green-500 mb-2">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">Konto Google jest połączone</span>
            </div>
            <p className="text-sm text-[var(--text-muted)]">
              Twoje konto Google zostało pomyślnie powiązane z systemem MyPerformance.
            </p>
          </div>
        )}

        {/* Feature cards */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-[var(--text-main)]">Dostępne uprawnienia i funkcje</h3>

          {[
            {
              icon: <ShieldCheck className="w-5 h-5 text-green-500" />,
              bg: "bg-green-500/10",
              title: "Weryfikacja adresu email",
              desc: "Potwierdzanie, że Twoje konto w systemie MyPerformance jest powiązane ze zweryfikowaną tożsamością Google.",
            },
            {
              icon: <Calendar className="w-5 h-5 text-blue-500" />,
              bg: "bg-blue-500/10",
              title: "Kalendarz Google",
              desc: "Tworzenie wydarzeń, spotkań i przypomnień w Twoim kalendarzu na wyraźne polecenie lub w wyniku akcji w systemie.",
            },
            {
              icon: <Tag className="w-5 h-5 text-purple-500" />,
              bg: "bg-purple-500/10",
              title: "Organizacja skrzynki Gmail",
              desc: "Tworzenie etykiety \"MyPerformance\" i ustawianie filtrów kierujących wiadomości z domeny @myperformance.pl.",
              warning: "System NIE ma dostępu do treści wiadomości email. Może jedynie zarządzać strukturą folderów i regułami.",
            },
          ].map(({ icon, bg, title, desc, warning }) => (
            <div key={title} className="p-4 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>{icon}</div>
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-[var(--text-main)]">{title}</h4>
                  <p className="text-xs text-[var(--text-muted)] mt-1">{desc}</p>
                  <div className="mt-2 flex items-center gap-1 text-xs text-green-500">
                    <CheckCircle2 className="w-3 h-3" />
                    Dostępne
                  </div>
                  {warning && (
                    <div className="mt-2 p-2 bg-yellow-500/5 border border-yellow-500/10 rounded-lg">
                      <p className="text-xs text-yellow-400"><strong>Ważne:</strong> {warning}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* What we don't do */}
        <div className="mt-6 p-4 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
          <h3 className="text-sm font-medium text-[var(--text-main)] mb-3 flex items-center gap-2">
            <ShieldIcon className="w-4 h-4 text-[var(--accent)]" />
            Czego NIE może robić system
          </h3>
          <ul className="space-y-2 text-sm text-[var(--text-muted)]">
            {[
              "Przeglądać lub czytać Twoje wiadomości email",
              "Wysyłać wiadomości w Twoim imieniu",
              "Usuwać plików z Dysku Google",
              "Przeglądać Twoje pliki na Dysku",
              "Modyfikować ustawień konta Google poza uprawnieniami",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <X className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Privacy note */}
        <div className="mt-6 p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-blue-400 mb-1">Bezpieczeństwo i prywatność</h4>
              <p className="text-xs text-[var(--text-muted)]">
                System działa na zasadzie <strong>zasady najmniejszego przywileju</strong> — ma dostęp wyłącznie do funkcji niezbędnych do działania.
                Dostęp możesz w każdej chwili odwołać klikając przycisk &quot;Odłącz&quot;.
              </p>
            </div>
          </div>
        </div>

        {googleConnected && (
          <div className="mt-4 p-4 bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-xl">
            <h4 className="text-sm font-medium text-[var(--text-main)] mb-2 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Problemy z połączeniem?
            </h4>
            <p className="text-xs text-[var(--text-muted)]">
              Jeśli operacja się nie powiedzie (np. token wygasł lub odłączyłeś aplikację w ustawieniach Google),
              odłącz i ponownie połącz konto Google używając przycisku powyżej.
            </p>
          </div>
        )}
      </div>

      {/* Google feature selection modal */}
      {googleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setGoogleModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-2xl p-6 shadow-2xl animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-[var(--text-main)]">
                Wybierz funkcje integracji Google
              </h3>
              <button
                onClick={() => setGoogleModalOpen(false)}
                className="p-2 text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              {[
                {
                  checked: googleFeatureEmail,
                  onChange: setGoogleFeatureEmail,
                  label: "Weryfikacja email",
                  desc: "Potwierdź swój email przez Google (automatycznie oznacza email jako zweryfikowany)",
                },
                {
                  checked: googleFeatureCalendar,
                  onChange: setGoogleFeatureCalendar,
                  label: "Kalendarz Google",
                  desc: "Twórz wydarzenia w Twoim kalendarzu (np. potwierdzenia połączenia)",
                },
                {
                  checked: googleFeatureGmail,
                  onChange: setGoogleFeatureGmail,
                  label: "Foldery Gmail",
                  desc: "Twórz etykiety/foldery w Gmail (np. \"MyPerformance\")",
                },
              ].map(({ checked, onChange, label, desc }) => (
                <label key={label} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-[var(--border-subtle)] bg-[var(--bg-main)] text-[var(--accent)] focus:ring-[var(--accent)]"
                  />
                  <div>
                    <span className="block text-sm font-medium text-[var(--text-main)]">{label}</span>
                    <span className="block text-xs text-[var(--text-muted)] mt-1">{desc}</span>
                  </div>
                </label>
              ))}
            </div>

            <div className="bg-[var(--bg-main)] border border-[var(--border-subtle)] rounded-lg p-3 mb-6">
              <p className="text-xs text-[var(--text-muted)]">
                <Info className="w-3 h-3 inline mr-1" />
                Google poprosi o wszystkie te uprawnienia na ekranie zgody. Możesz odznaczyć te, których nie chcesz udzielić.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setGoogleModalOpen(false)}
                className="flex-1 px-4 py-2 border border-[var(--border-subtle)] text-[var(--text-muted)] rounded-xl text-sm font-medium hover:text-[var(--text-main)] transition-colors"
              >
                Anuluj
              </button>
              <button
                onClick={onSubmitGoogleLink}
                disabled={connectingGoogle}
                className="flex-1 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {connectingGoogle ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Łączenie...
                  </>
                ) : "Połącz"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
