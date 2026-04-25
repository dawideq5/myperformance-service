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
  chatwootCatalogService,
  chatwootInboxService,
  documensoCatalogService,
  documensoMembershipService,
  moodleCatalogService,
  moodleCourseService,
  permissionAreaService,
  type AdminGroup,
  type AreaSummary,
  type ChatwootInbox,
  type DocumensoOrganisation,
  type MoodleCourseRow,
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
  const [areas, setAreas] = useState<AreaSummary[]>([]);

  // Per-app catalog + selections
  const [orgs, setOrgs] = useState<DocumensoOrganisation[]>([]);
  const [orgIds, setOrgIds] = useState<Set<string>>(new Set());
  const [inboxes, setInboxes] = useState<ChatwootInbox[]>([]);
  const [inboxIds, setInboxIds] = useState<Set<number>>(new Set());
  const [courses, setCourses] = useState<MoodleCourseRow[]>([]);
  const [courseIds, setCourseIds] = useState<Set<number>>(new Set());

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
    setOrgIds(new Set());
    setInboxIds(new Set());
    setCourseIds(new Set());
    setError(null);
    setTimeout(() => emailRef.current?.focus(), 50);
    void Promise.all([
      adminGroupService.list().then((r) => setGroups(r.groups)).catch(() => setGroups([])),
      permissionAreaService.list().then((r) => setAreas(r.areas)).catch(() => setAreas([])),
      documensoCatalogService.list().then((r) => setOrgs(r.organisations)).catch(() => setOrgs([])),
      chatwootCatalogService.list().then((r) => setInboxes(r.inboxes)).catch(() => setInboxes([])),
      moodleCatalogService.list().then((r) => setCourses(r.courses)).catch(() => setCourses([])),
    ]);
  }, [open]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === groupId) ?? null,
    [groups, groupId],
  );

  // Auto-fill area roles po wyborze grupy — najwyższy priority role grupy
  // w obrębie każdej area zostaje ustawiony jako wybrana.
  useEffect(() => {
    if (!selectedGroup || areas.length === 0) return;
    const next: UserRolesListValue = {};
    const groupRoleSet = new Set(selectedGroup.realmRoles);
    for (const area of areas) {
      const matches = area.roles.filter((r) => groupRoleSet.has(r.name));
      if (matches.length === 0) {
        next[area.id] = null;
        continue;
      }
      const best = matches.reduce((a, b) => (b.priority > a.priority ? b : a));
      next[area.id] = best.name;
    }
    setAreaRoles(next);
  }, [selectedGroup, areas]);

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
        // Po stworzeniu — best-effort: grupa, Documenso orgs, Chatwoot
        // inboxes, Moodle courses. Failures są łapane indywidualnie żeby
        // nie blokować całego invite.
        if (res.id) {
          if (groupId) {
            await adminGroupService
              .bulkAssign({ userIds: [res.id], groupId, replace: true })
              .catch(() => undefined);
          }
          await Promise.all([
            ...Array.from(orgIds).map((oid) =>
              documensoMembershipService.add(res.id, oid).catch(() => undefined),
            ),
            ...Array.from(inboxIds).map((iid) =>
              chatwootInboxService.add(res.id, iid).catch(() => undefined),
            ),
            ...Array.from(courseIds).map((cid) =>
              moodleCourseService.add(res.id, cid).catch(() => undefined),
            ),
          ]);
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
    [email, firstName, lastName, areaRoles, groupId, orgIds, inboxIds, courseIds, onInvited],
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
              Grupa
            </h3>
            <span className="text-xs text-[var(--text-muted)]">
              opcjonalne — auto-zaznaczy role poniżej
            </span>
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
          <div className="max-h-[35vh] overflow-y-auto pr-1">
            <UserRolesList
              value={areaRoles}
              onChange={setAreaRoles}
              disabled={loading}
            />
          </div>
        </div>

        <PerAppPicker
          title="Dokumenty (Documenso) — organizacje"
          items={orgs.map((o) => ({
            id: o.id,
            label: o.name,
            sub: `${o.teams.length} ${o.teams.length === 1 ? "zespół" : "zespoły"}`,
          }))}
          selected={orgIds as Set<string | number>}
          onToggle={(id) => {
            setOrgIds((p) => {
              const n = new Set(p);
              if (n.has(id as string)) n.delete(id as string);
              else n.add(id as string);
              return n;
            });
          }}
          disabled={loading}
        />
        <PerAppPicker
          title="Chatwoot — kanały"
          items={inboxes.map((i) => ({
            id: i.id,
            label: i.name,
            sub: i.channel_type.replace("Channel::", ""),
          }))}
          selected={inboxIds as Set<string | number>}
          onToggle={(id) => {
            setInboxIds((p) => {
              const n = new Set(p);
              if (n.has(id as number)) n.delete(id as number);
              else n.add(id as number);
              return n;
            });
          }}
          disabled={loading}
        />
        <PerAppPicker
          title="Akademia (Moodle) — kursy"
          items={courses.map((c) => ({
            id: c.id,
            label: c.fullname,
            sub: c.shortname,
          }))}
          selected={courseIds as Set<string | number>}
          onToggle={(id) => {
            setCourseIds((p) => {
              const n = new Set(p);
              if (n.has(id as number)) n.delete(id as number);
              else n.add(id as number);
              return n;
            });
          }}
          disabled={loading}
        />
      </form>
    </Dialog>
  );
}

function PerAppPicker({
  title,
  items,
  selected,
  onToggle,
  disabled,
}: {
  title: string;
  items: Array<{ id: string | number; label: string; sub?: string }>;
  selected: Set<string | number>;
  onToggle: (id: string | number) => void;
  disabled?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-[var(--text-main)]">{title}</h3>
        <span className="text-xs text-[var(--text-muted)]">
          {selected.size > 0 ? `${selected.size} zaznaczonych` : "opcjonalne"}
        </span>
      </div>
      <div className="grid gap-1 max-h-[20vh] overflow-y-auto pr-1">
        {items.map((it) => {
          const has = selected.has(it.id);
          return (
            <label
              key={String(it.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer text-sm ${
                has
                  ? "border-green-500/40 bg-green-500/5"
                  : "border-[var(--border-subtle)] hover:border-[var(--accent)]/40"
              } ${disabled ? "opacity-50 pointer-events-none" : ""}`}
            >
              <input
                type="checkbox"
                checked={has}
                onChange={() => onToggle(it.id)}
                disabled={disabled}
                className="rounded border-[var(--border-subtle)]"
              />
              <span className="flex-1 min-w-0">
                <span className="text-[var(--text-main)]">{it.label}</span>
                {it.sub && (
                  <span className="text-xs text-[var(--text-muted)] ml-2">{it.sub}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
