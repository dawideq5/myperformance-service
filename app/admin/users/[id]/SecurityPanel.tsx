"use client";

import { useCallback, useState } from "react";
import {
  AlertTriangle,
  Check,
  KeyRound,
  Mail,
  ShieldAlert,
  X,
} from "lucide-react";

import { Alert, Badge, Button, Card, FieldWrapper, Input } from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import { adminUserService } from "@/app/account/account-service";

interface SecurityPanelProps {
  userId: string;
  email: string | null;
  emailVerified: boolean;
  onUpdated: () => void;
}

type PasswordMode = "email" | "manual";

export function SecurityPanel({
  userId,
  email,
  emailVerified,
  onUpdated,
}: SecurityPanelProps) {
  // Password reset state
  const [pwMode, setPwMode] = useState<PasswordMode>("email");
  const [pwManual, setPwManual] = useState("");
  const [pwTemporary, setPwTemporary] = useState(true);
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwNotice, setPwNotice] = useState<string | null>(null);

  // Email verification state
  const [emailBusy, setEmailBusy] = useState<"send" | "set" | "unset" | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const submitPassword = useCallback(async () => {
    setPwError(null);
    setPwNotice(null);
    if (pwMode === "email" && !email) {
      setPwError("User nie ma adresu email — użyj trybu ręcznego.");
      return;
    }
    if (pwMode === "manual" && pwManual.length < 8) {
      setPwError("Hasło musi mieć co najmniej 8 znaków.");
      return;
    }
    setPwSubmitting(true);
    try {
      if (pwMode === "email") {
        await adminUserService.resetPassword(userId, {
          sendEmail: true,
          temporary: pwTemporary,
        });
        setPwNotice(`Wysłano link resetu hasła do ${email}.`);
      } else {
        await adminUserService.resetPassword(userId, {
          password: pwManual,
          temporary: pwTemporary,
          sendEmail: false,
        });
        setPwNotice(
          pwTemporary
            ? "Hasło ustawione — user będzie musiał je zmienić przy pierwszym logowaniu."
            : "Hasło ustawione jako stałe.",
        );
        setPwManual("");
      }
      onUpdated();
    } catch (err) {
      setPwError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się ustawić hasła",
      );
    } finally {
      setPwSubmitting(false);
    }
  }, [userId, email, pwMode, pwManual, pwTemporary, onUpdated]);

  const sendVerifyLink = useCallback(async () => {
    if (!email) return;
    setEmailError(null);
    setEmailNotice(null);
    setEmailBusy("send");
    try {
      await adminUserService.sendActions(userId, {
        actions: ["VERIFY_EMAIL"],
        sendEmail: true,
      });
      setEmailNotice(`Wysłano link weryfikacji na ${email}.`);
      onUpdated();
    } catch (err) {
      setEmailError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się wysłać linku",
      );
    } finally {
      setEmailBusy(null);
    }
  }, [userId, email, onUpdated]);

  const setVerified = useCallback(
    async (value: boolean) => {
      setEmailError(null);
      setEmailNotice(null);
      setEmailBusy(value ? "set" : "unset");
      try {
        await adminUserService.update(userId, { emailVerified: value });
        setEmailNotice(
          value
            ? "Email oznaczony jako zweryfikowany."
            : "Weryfikacja emaila unieważniona — wszystkie sesje zostały zakończone.",
        );
        onUpdated();
      } catch (err) {
        setEmailError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się zaktualizować statusu",
        );
      } finally {
        setEmailBusy(null);
      }
    },
    [userId, onUpdated],
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* PASSWORD CARD */}
      <Card padding="md">
        <header className="flex items-center gap-2 mb-3">
          <KeyRound className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
          <h3 className="font-semibold text-sm text-[var(--text-main)]">
            Hasło
          </h3>
        </header>

        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setPwMode("email")}
            className={`flex-1 px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
              pwMode === "email"
                ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]"
                : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-main)]"
            }`}
          >
            Link w emailu
          </button>
          <button
            type="button"
            onClick={() => setPwMode("manual")}
            className={`flex-1 px-3 py-2 rounded-md text-xs font-medium border transition-colors ${
              pwMode === "manual"
                ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]"
                : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:bg-[var(--bg-main)]"
            }`}
          >
            Ustaw ręcznie
          </button>
        </div>

        {pwMode === "manual" && (
          <FieldWrapper id="pw-manual" label="Nowe hasło" className="mb-3">
            <Input
              id="pw-manual"
              type="text"
              autoComplete="off"
              value={pwManual}
              onChange={(e) => setPwManual(e.target.value)}
              placeholder="min. 8 znaków"
            />
          </FieldWrapper>
        )}

        <label className="flex items-center gap-2 text-sm text-[var(--text-main)] mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={pwTemporary}
            onChange={(e) => setPwTemporary(e.target.checked)}
          />
          <span>
            Wymagaj zmiany przy najbliższym logowaniu
          </span>
        </label>

        {pwError && (
          <div className="mb-2">
            <Alert tone="error">{pwError}</Alert>
          </div>
        )}
        {pwNotice && (
          <div className="mb-2">
            <Alert tone="success">{pwNotice}</Alert>
          </div>
        )}

        <Button
          size="sm"
          onClick={() => void submitPassword()}
          loading={pwSubmitting}
          disabled={pwMode === "email" ? !email : pwManual.length < 8}
          leftIcon={
            pwMode === "email" ? (
              <Mail className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Check className="w-4 h-4" aria-hidden="true" />
            )
          }
        >
          {pwMode === "email" ? "Wyślij link resetu" : "Ustaw hasło"}
        </Button>
      </Card>

      {/* EMAIL VERIFICATION CARD */}
      <Card padding="md">
        <header className="flex items-center gap-2 mb-3">
          <Mail className="w-5 h-5 text-[var(--accent)]" aria-hidden="true" />
          <h3 className="font-semibold text-sm text-[var(--text-main)]">
            Weryfikacja emaila
          </h3>
          {emailVerified ? (
            <Badge tone="success">zweryfikowany</Badge>
          ) : (
            <Badge tone="warning">niezweryfikowany</Badge>
          )}
        </header>

        <p className="text-xs text-[var(--text-muted)] mb-3">
          Wyślij link potwierdzający na adres usera, oznacz ręcznie jako
          zweryfikowany, lub unieważnij weryfikację (zakończy wszystkie sesje).
        </p>

        {emailError && (
          <div className="mb-2">
            <Alert tone="error">{emailError}</Alert>
          </div>
        )}
        {emailNotice && (
          <div className="mb-2">
            <Alert tone="success">{emailNotice}</Alert>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void sendVerifyLink()}
            loading={emailBusy === "send"}
            disabled={!email || !!emailBusy}
            leftIcon={<Mail className="w-4 h-4" aria-hidden="true" />}
          >
            Wyślij link
          </Button>
          {!emailVerified && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void setVerified(true)}
              loading={emailBusy === "set"}
              disabled={!!emailBusy}
              leftIcon={<Check className="w-4 h-4" aria-hidden="true" />}
            >
              Oznacz jako zweryfikowany
            </Button>
          )}
          {emailVerified && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (
                  window.confirm(
                    "Unieważnić weryfikację emaila? Spowoduje to zakończenie wszystkich aktywnych sesji usera.",
                  )
                ) {
                  void setVerified(false);
                }
              }}
              loading={emailBusy === "unset"}
              disabled={!!emailBusy}
              leftIcon={<ShieldAlert className="w-4 h-4" aria-hidden="true" />}
              className="text-amber-500 hover:text-amber-600"
            >
              Unieważnij weryfikację
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
