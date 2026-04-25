"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mail } from "lucide-react";

import {
  Alert,
  Button,
  Dialog,
  FieldWrapper,
  Input,
} from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import {
  adminGroupService,
  adminUserService,
  type AdminGroup,
} from "@/app/account/account-service";
import {
  UserRolesList,
  type UserRolesListValue,
} from "@/components/UserRolesList";

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
  const [areaRoles, setAreaRoles] = useState<UserRolesListValue>({});
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [groupId, setGroupId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setFirstName("");
    setLastName("");
    setAreaRoles({});
    setGroupId("");
    setError(null);
    setTimeout(() => emailRef.current?.focus(), 50);
    void adminGroupService
      .list()
      .then((r) => setGroups(r.groups))
      .catch(() => setGroups([]));
  }, [open]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === groupId) ?? null,
    [groups, groupId],
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
        // Po stworzeniu, jeśli wybrana grupa — dodaj user (replace=true).
        if (groupId && res.id) {
          try {
            await adminGroupService.bulkAssign({
              userIds: [res.id],
              groupId,
              replace: true,
            });
          } catch {
            // best-effort
          }
        }
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
    [email, firstName, lastName, areaRoles, groupId, onInvited],
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
              Grupa Keycloak (persona)
            </h3>
            <span className="text-xs text-[var(--text-muted)]">opcjonalne</span>
          </div>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            disabled={loading}
            className="w-full px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm"
          >
            <option value="">— bez grupy —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.realmRoles.length > 0 ? ` (${g.realmRoles.length} ról)` : ""}
              </option>
            ))}
          </select>
          {selectedGroup && (
            <div className="px-3 py-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5">
              <p className="text-xs text-[var(--text-muted)] mb-1">
                User otrzyma realm roles:
              </p>
              <div className="flex flex-wrap gap-1">
                {selectedGroup.realmRoles.length === 0 ? (
                  <span className="text-xs text-[var(--text-muted)]">brak ról</span>
                ) : (
                  selectedGroup.realmRoles.map((r) => (
                    <span
                      key={r}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-main)] border border-[var(--border-subtle)]"
                    >
                      {r}
                    </span>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-[var(--text-main)]">
              Lub uprawnienia per aplikacja
            </h3>
            <span className="text-xs text-[var(--text-muted)]">
              opcjonalne — możesz zmienić później
            </span>
          </div>
          <div className="max-h-[40vh] overflow-y-auto pr-1">
            <UserRolesList
              value={areaRoles}
              onChange={setAreaRoles}
              disabled={loading}
            />
          </div>
        </div>
      </form>
    </Dialog>
  );
}
