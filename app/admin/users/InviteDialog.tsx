"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Mail } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Dialog,
  FieldWrapper,
  Input,
} from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import {
  adminUserService,
  permissionAreaService,
  roleTemplateService,
  type AreaSummary,
  type RoleTemplate,
} from "@/app/account/account-service";

interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
  onInvited: (payload: {
    email: string;
    roleAssignmentErrors: Array<{ areaId: string; error: string }>;
  }) => void;
}

export function InviteDialog({ open, onClose, onInvited }: InviteDialogProps) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [areas, setAreas] = useState<AreaSummary[] | null>(null);
  const [areaRoles, setAreaRoles] = useState<Record<string, string | null>>({});
  const [templates, setTemplates] = useState<RoleTemplate[]>([]);
  const [appliedTemplateId, setAppliedTemplateId] = useState<string>("");
  const [loadingAreas, setLoadingAreas] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setFirstName("");
    setLastName("");
    setAreaRoles({});
    setAppliedTemplateId("");
    setError(null);
    setTimeout(() => emailRef.current?.focus(), 50);
    setLoadingAreas(true);
    Promise.all([
      permissionAreaService.list(),
      roleTemplateService.list().catch(() => ({ templates: [] })),
    ])
      .then(([areasRes, tplRes]) => {
        setAreas(areasRes.areas);
        const map: Record<string, string | null> = {};
        for (const a of areasRes.areas) map[a.id] = null;
        setAreaRoles(map);
        setTemplates(tplRes.templates);
      })
      .catch(() => {
        setAreas([]);
      })
      .finally(() => setLoadingAreas(false));
  }, [open]);

  const applyTemplate = useCallback(
    (tplId: string) => {
      setAppliedTemplateId(tplId);
      if (!tplId) {
        const map: Record<string, string | null> = {};
        for (const a of areas ?? []) map[a.id] = null;
        setAreaRoles(map);
        return;
      }
      const tpl = templates.find((t) => t.id === tplId);
      if (!tpl) return;
      const map: Record<string, string | null> = {};
      for (const a of areas ?? []) map[a.id] = null;
      for (const ar of tpl.areaRoles) {
        if (map[ar.areaId] !== undefined) map[ar.areaId] = ar.roleName;
      }
      setAreaRoles(map);
    },
    [areas, templates],
  );

  const roleCount = useMemo(
    () => Object.values(areaRoles).filter(Boolean).length,
    [areaRoles],
  );

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmedEmail = email.trim();
      if (!trimmedEmail || !trimmedEmail.includes("@")) {
        setError("Podaj prawidłowy email");
        return;
      }
      if (!firstName.trim() || !lastName.trim()) {
        setError(
          "Imię i nazwisko są wymagane — Moodle i inne aplikacje ich wymagają.",
        );
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const payload = Object.entries(areaRoles)
          .filter(([, roleName]) => roleName !== null)
          .map(([areaId, roleName]) => ({ areaId, roleName }));
        const res = await adminUserService.invite({
          email: trimmedEmail,
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          areaRoles: payload,
        });
        onInvited({
          email: trimmedEmail,
          roleAssignmentErrors: res.roleAssignmentErrors ?? [],
        });
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się wysłać zaproszenia",
        );
      } finally {
        setLoading(false);
      }
    },
    [email, firstName, lastName, areaRoles, onInvited],
  );

  return (
    <Dialog
      open={open}
      onClose={loading ? () => {} : onClose}
      size="lg"
      title="Zaproś użytkownika"
      description="Utworzy konto w Keycloak, przypisze wybrane role i wyśle email z linkiem do ustawienia hasła."
      labelledById="invite-user-title"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Anuluj
          </Button>
          <Button
            type="submit"
            form="invite-user-form"
            loading={loading}
            leftIcon={<Mail className="w-4 h-4" aria-hidden="true" />}
          >
            Wyślij zaproszenie {roleCount > 0 && `(+${roleCount} ról)`}
          </Button>
        </>
      }
    >
      <form id="invite-user-form" onSubmit={submit} className="space-y-5">
        {error && <Alert tone="error">{error}</Alert>}

        <div className="space-y-3">
          <FieldWrapper id="invite-email" label="Email" required>
            <Input
              ref={emailRef}
              id="invite-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jan.kowalski@example.com"
            />
          </FieldWrapper>
          <div className="grid grid-cols-2 gap-3">
            <FieldWrapper id="invite-first" label="Imię" required>
              <Input
                id="invite-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </FieldWrapper>
            <FieldWrapper id="invite-last" label="Nazwisko" required>
              <Input
                id="invite-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </FieldWrapper>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-[var(--text-main)]">
              Uprawnienia startowe
            </h3>
            <span className="text-xs text-[var(--text-muted)]">
              opcjonalne — możesz zmienić później
            </span>
          </div>
          {templates.length > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <label className="text-xs text-[var(--text-muted)] flex-shrink-0">
                Zastosuj szablon:
              </label>
              <select
                value={appliedTemplateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className="flex-1 px-2 py-1.5 rounded-md bg-[var(--bg-main)] border border-[var(--border-subtle)] text-xs text-[var(--text-main)]"
              >
                <option value="">— nie stosuj —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.description ? ` — ${t.description}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          {loadingAreas ? (
            <p className="text-xs text-[var(--text-muted)]">
              Ładowanie aplikacji…
            </p>
          ) : areas && areas.length > 0 ? (
            <ul className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
              {areas.map((a) => {
                const offline = a.provider === "native" && !a.nativeConfigured;
                const current = areaRoles[a.id] ?? null;
                return (
                  <li
                    key={a.id}
                    className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-[var(--text-main)]">
                          {a.label}
                        </span>
                        <Badge
                          tone={a.provider === "native" ? "info" : "neutral"}
                        >
                          {a.provider === "native" ? "native" : "KC-only"}
                        </Badge>
                        {offline && (
                          <Badge tone="warning">
                            <AlertTriangle
                              className="w-3 h-3 mr-0.5"
                              aria-hidden="true"
                            />
                            offline
                          </Badge>
                        )}
                      </div>
                    </div>
                    <select
                      value={current ?? ""}
                      onChange={(e) =>
                        setAreaRoles((prev) => ({
                          ...prev,
                          [a.id]: e.target.value === "" ? null : e.target.value,
                        }))
                      }
                      disabled={loading}
                      className="w-full px-3 py-1.5 rounded-md bg-[var(--bg-main)] border border-[var(--border-subtle)] text-sm text-[var(--text-main)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    >
                      <option value="">— brak dostępu —</option>
                      {a.seedRoles.map((r) => (
                        <option key={r.name} value={r.name}>
                          {r.name}
                          {r.description ? ` — ${r.description}` : ""}
                        </option>
                      ))}
                    </select>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              Nie udało się pobrać listy aplikacji — zaproszenie zostanie
              wysłane bez pre-assignu.
            </p>
          )}
        </div>
      </form>
    </Dialog>
  );
}
