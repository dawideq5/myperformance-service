"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Shield, Trash2, Users, X } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  FieldWrapper,
  Input,
  OnboardingCard,
  PageShell,
} from "@/components/ui";
import { AppHeader } from "@/components/AppHeader";
import { ApiRequestError } from "@/lib/api-client";
import {
  adminGroupService,
  adminUserService,
  permissionAreaService,
  type AdminGroup,
  type AdminGroupMember,
  type AdminUserSummary,
  type AreaSummary,
} from "@/app/account/account-service";

interface GroupsClientProps {
  userLabel?: string;
  userEmail?: string;
  /** Gdy true — komponent nie renderuje PageShell/AppHeader (parent already does). */
  embedded?: boolean;
}

export function GroupsClient({ userLabel, userEmail, embedded }: GroupsClientProps) {
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [areas, setAreas] = useState<AreaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editFor, setEditFor] = useState<AdminGroup | null>(null);
  const [membersFor, setMembersFor] = useState<AdminGroup | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [g, a] = await Promise.all([
        adminGroupService.list(),
        permissionAreaService.list(),
      ]);
      setGroups(g.groups);
      setAreas(a.areas);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : "Nie udało się pobrać grup",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const deleteGroup = useCallback(
    async (g: AdminGroup) => {
      if (
        !window.confirm(
          `Usunąć grupę "${g.name}"?\n\nUsunięcie nie kasuje realm ról ani użytkowników — tylko relację grupowania. Userzy stracą role odziedziczone z tej grupy.`,
        )
      )
        return;
      try {
        await adminGroupService.remove(g.id);
        setNotice(`Grupa "${g.name}" usunięta`);
        void refresh();
      } catch (err) {
        setError(
          err instanceof ApiRequestError ? err.message : "Nie udało się usunąć grupy",
        );
      }
    },
    [refresh],
  );

  const Wrapper = embedded
    ? ({ children }: { children: React.ReactNode }) => <>{children}</>
    : ({ children }: { children: React.ReactNode }) => (
        <PageShell
          maxWidth="2xl"
          header={
            <AppHeader
              backHref="/dashboard"
              title="Grupy Keycloak"
              userLabel={userLabel}
              userSubLabel={userEmail}
            />
          }
        >
          {children}
        </PageShell>
      );

  return (
    <Wrapper>
      <OnboardingCard
        storageKey="admin-groups"
        title="Grupy = persony / zespoły"
        requiresArea="keycloak"
        requiresMinPriority={90}
      >
        Grupa to zestaw realm roles przyznawanych łącznie. Member-of-group
        dziedziczy wszystkie role grupy + swoje własne. Praktyka: jedna grupa
        per persona ("Sprzedawca", "Pełen admin"), a userzy są w 1-2 grupach
        zamiast 10 osobnych ról.
      </OnboardingCard>

      <section className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <p className="text-sm text-[var(--text-muted)] max-w-2xl">
          Tworzenie grup-person (np. Administrator, Sprzedawca, Serwisant).
          Każda grupa mapuje zestaw realm roles; użytkownik w grupie dziedziczy
          wszystkie role. Członkostwo i role grup zarządzaj też w konsoli
          Keycloak — zmiany są współdzielone.
        </p>
        <Button
          leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}
          onClick={() => setCreateOpen(true)}
        >
          Nowa grupa
        </Button>
      </section>

      {error && (
        <div className="mb-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {notice && (
        <div className="mb-4">
          <Alert tone="success">{notice}</Alert>
        </div>
      )}

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border-subtle)]">
              <tr className="text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-4 py-3 font-medium">Nazwa</th>
                <th className="px-4 py-3 font-medium">Opis</th>
                <th className="px-4 py-3 font-medium">Role realmu</th>
                <th className="px-4 py-3 font-medium">Członkowie</th>
                <th className="px-4 py-3 font-medium text-right">Akcje</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--text-muted)]">
                    <Loader2 className="w-5 h-5 animate-spin inline-block" aria-hidden="true" />
                  </td>
                </tr>
              ) : groups.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-[var(--text-muted)]">
                    Brak grup. Utwórz pierwszą grupę np. &bdquo;Administrator&rdquo;
                    i dołącz do niej role <code>admin</code>, <code>manage_users</code>.
                  </td>
                </tr>
              ) : (
                groups.map((g) => (
                  <tr
                    key={g.id}
                    className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-main)]"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--text-main)]">{g.name}</td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">
                      {g.description || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {g.realmRoles.length === 0 ? (
                          <span className="text-xs text-[var(--text-muted)]">brak</span>
                        ) : (
                          g.realmRoles.slice(0, 5).map((r) => (
                            <Badge key={r} tone="neutral" className="text-[10px] font-mono">
                              {r}
                            </Badge>
                          ))
                        )}
                        {g.realmRoles.length > 5 && (
                          <span className="text-xs text-[var(--text-muted)]">
                            +{g.realmRoles.length - 5}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={g.memberCount > 0 ? "info" : "neutral"}>
                        <Users className="w-3 h-3" aria-hidden="true" />
                        {g.memberCount}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditFor(g)}
                          leftIcon={<Shield className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                          Role
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setMembersFor(g)}
                          leftIcon={<Users className="w-3.5 h-3.5" aria-hidden="true" />}
                        >
                          Członkowie
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void deleteGroup(g)}
                          className="text-red-500 hover:text-red-600"
                          title="Usuń grupę"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <CreateGroupDialog
        open={createOpen}
        areas={areas}
        onClose={() => setCreateOpen(false)}
        onCreated={(name) => {
          setCreateOpen(false);
          setNotice(`Grupa "${name}" utworzona`);
          void refresh();
        }}
      />

      <RolesDialog
        group={editFor}
        areas={areas}
        onClose={() => setEditFor(null)}
        onSaved={() => {
          setEditFor(null);
          setNotice("Role grupy zaktualizowane");
          void refresh();
        }}
      />

      <MembersDialog
        group={membersFor}
        onClose={() => setMembersFor(null)}
        onChanged={() => {
          setNotice("Członkostwo zaktualizowane");
          void refresh();
        }}
      />
    </Wrapper>
  );
}

// ─── CreateGroupDialog ────────────────────────────────────────────────────────

function CreateGroupDialog({
  open,
  areas,
  onClose,
  onCreated,
}: {
  open: boolean;
  areas: AreaSummary[];
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setSelectedRoles(new Set());
      setError(null);
    }
  }, [open]);

  const toggleRole = (r: string) => {
    setSelectedRoles((p) => {
      const n = new Set(p);
      if (n.has(r)) n.delete(r);
      else n.add(r);
      return n;
    });
  };

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) {
        setError("Nazwa jest wymagana");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await adminGroupService.create({
          name: trimmed,
          description: description.trim() || undefined,
          realmRoles: Array.from(selectedRoles),
        });
        onCreated(trimmed);
      } catch (err) {
        setError(
          err instanceof ApiRequestError ? err.message : "Nie udało się utworzyć grupy",
        );
      } finally {
        setLoading(false);
      }
    },
    [name, description, selectedRoles, onCreated],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Nowa grupa"
      description="Nadaj grupie nazwę i zaznacz role realmu które będą dziedziczone przez członków."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Anuluj
          </Button>
          <Button
            type="submit"
            form="create-group-form"
            loading={loading}
            leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}
          >
            Utwórz
          </Button>
        </>
      }
    >
      <form id="create-group-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <FieldWrapper id="group-name" label="Nazwa" required>
          <Input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="np. Administrator, Sprzedawca, Serwisant"
          />
        </FieldWrapper>
        <FieldWrapper id="group-desc" label="Opis (opcjonalny)">
          <Input
            id="group-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Krótki opis przeznaczenia grupy"
          />
        </FieldWrapper>
        <RoleCheckboxList areas={areas} selected={selectedRoles} onToggle={toggleRole} />
      </form>
    </Dialog>
  );
}

// ─── RolesDialog ──────────────────────────────────────────────────────────────

function RolesDialog({
  group,
  areas,
  onClose,
  onSaved,
}: {
  group: AdminGroup | null;
  areas: AreaSummary[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (group) {
      setSelected(new Set(group.realmRoles));
      setError(null);
    }
  }, [group]);

  const toggle = (r: string) => {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(r)) n.delete(r);
      else n.add(r);
      return n;
    });
  };

  const save = useCallback(async () => {
    if (!group) return;
    setSaving(true);
    setError(null);
    try {
      await adminGroupService.setRoles(group.id, Array.from(selected));
      onSaved();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Nie udało się zapisać ról",
      );
    } finally {
      setSaving(false);
    }
  }, [group, selected, onSaved]);

  return (
    <Dialog
      open={!!group}
      onClose={onClose}
      size="lg"
      title={group ? `Role grupy: ${group.name}` : ""}
      description="Zaznacz role realmu dziedziczone przez wszystkich członków. Niezaznaczone są zdejmowane."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Anuluj
          </Button>
          <Button
            onClick={() => void save()}
            loading={saving}
            leftIcon={<Shield className="w-4 h-4" aria-hidden="true" />}
          >
            Zapisz
          </Button>
        </>
      }
    >
      {error && (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      <RoleCheckboxList areas={areas} selected={selected} onToggle={toggle} />
    </Dialog>
  );
}

function RoleCheckboxList({
  areas,
  selected,
  onToggle,
}: {
  areas: AreaSummary[];
  selected: Set<string>;
  onToggle: (r: string) => void;
}) {
  return (
    <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-3">
      {areas.map((a) => {
        const activeCount = a.roles.filter((r) => selected.has(r.name)).length;
        return (
          <section
            key={a.id}
            className="px-3 py-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
          >
            <header className="flex items-baseline justify-between gap-2 mb-2">
              <h4 className="text-sm font-medium text-[var(--text-main)]">
                {a.label}
              </h4>
              {activeCount > 0 && (
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                  {activeCount}/{a.roles.length}
                </span>
              )}
            </header>
            <div className="flex flex-wrap gap-1.5">
              {a.roles.map((r) => {
                const active = selected.has(r.name);
                return (
                  <button
                    key={r.name}
                    type="button"
                    onClick={() => onToggle(r.name)}
                    title={r.description || r.name}
                    className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                      active
                        ? "bg-[var(--accent)] text-[var(--accent-fg)] border-[var(--accent)]"
                        : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-main)]"
                    }`}
                  >
                    {r.label || r.name}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ─── MembersDialog ────────────────────────────────────────────────────────────

function MembersDialog({
  group,
  onClose,
  onChanged,
}: {
  group: AdminGroup | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [members, setMembers] = useState<AdminGroupMember[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<AdminUserSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (group) {
      setMembers(group.members);
      setSearchInput("");
      setSearchResults([]);
      setError(null);
    }
  }, [group]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);

  const search = useCallback(async () => {
    const q = searchInput.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await adminUserService.list({ search: q, first: 0, max: 20 });
      setSearchResults(res.users);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Wyszukiwanie zawiodło");
    } finally {
      setSearching(false);
    }
  }, [searchInput]);

  const addMember = useCallback(
    async (u: AdminUserSummary) => {
      if (!group) return;
      setPending(u.id);
      setError(null);
      try {
        await adminGroupService.addMember(group.id, u.id);
        setMembers((prev) => [
          ...prev,
          {
            id: u.id,
            username: u.username,
            email: u.email,
            firstName: u.firstName,
            lastName: u.lastName,
          },
        ]);
        onChanged();
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Dodanie nie powiodło się");
      } finally {
        setPending(null);
      }
    },
    [group, onChanged],
  );

  const removeMember = useCallback(
    async (m: AdminGroupMember) => {
      if (!group) return;
      setPending(m.id);
      setError(null);
      try {
        await adminGroupService.removeMember(group.id, m.id);
        setMembers((prev) => prev.filter((x) => x.id !== m.id));
        onChanged();
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Usunięcie nie powiodło się");
      } finally {
        setPending(null);
      }
    },
    [group, onChanged],
  );

  return (
    <Dialog
      open={!!group}
      onClose={onClose}
      size="lg"
      title={group ? `Członkowie: ${group.name}` : ""}
      description={`${members.length} użytkowników`}
      footer={
        <Button variant="ghost" onClick={onClose}>
          <X className="w-4 h-4 mr-1.5" aria-hidden="true" />
          Zamknij
        </Button>
      }
    >
      {error && (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <Alert tone="info">
        Dodawanie użytkownika do grupy odbywa się w zakładce
        <strong> Użytkownicy → wybierz konto → Uprawnienia → Grupy Keycloak</strong>.
      </Alert>

      <section className="mt-4">
        <h4 className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-2">
          Obecni członkowie
        </h4>
        {members.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Grupa jest pusta.</p>
        ) : (
          <ul className="space-y-1 max-h-[260px] overflow-y-auto">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-2 px-3 py-1.5 rounded border border-[var(--border-subtle)] text-sm"
              >
                <span>
                  <span className="text-[var(--text-main)]">
                    {[m.firstName, m.lastName].filter(Boolean).join(" ") || m.username}
                  </span>{" "}
                  <span className="text-[var(--text-muted)]">({m.email ?? m.username})</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-red-500 hover:text-red-600"
                  disabled={pending === m.id}
                  loading={pending === m.id}
                  onClick={() => void removeMember(m)}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Dialog>
  );
}
