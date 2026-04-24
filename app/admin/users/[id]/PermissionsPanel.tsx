"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FileSignature,
  GraduationCap,
  Loader2,
  MessageSquare,
  Shield,
  Users,
} from "lucide-react";

import { Alert, Badge, Button, Card } from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import {
  adminGroupService,
  adminUserService,
  chatwootInboxService,
  documensoMembershipService,
  moodleCourseService,
  permissionAreaService,
  type AdminGroup,
  type AreaSummary,
  type ChatwootInbox,
  type DocumensoMembership,
  type DocumensoOrganisation,
  type MoodleCourseRow,
} from "@/app/account/account-service";
import {
  UserRolesList,
  type UserRolesListValue,
} from "@/components/UserRolesList";

type DiffType = "unchanged" | "added" | "upgrade" | "downgrade";
interface AreaDiff {
  area: AreaSummary;
  type: DiffType;
  currentRoleLabel?: string | null;
  incomingRoleLabel?: string;
}

function computeGroupDiff(
  current: UserRolesListValue,
  groupRoles: string[],
  areas: AreaSummary[],
): AreaDiff[] {
  const groupSet = new Set(groupRoles);
  return areas.map((area) => {
    // Najwyższy priorytet rolą z grupy w obrębie area.
    const incomingArr = area.roles.filter((r) => groupSet.has(r.name));
    const incoming = incomingArr.length
      ? incomingArr.reduce((best, r) => (r.priority > best.priority ? r : best))
      : null;
    const currentName = current[area.id] ?? null;
    const currentRole = currentName
      ? area.roles.find((r) => r.name === currentName)
      : null;

    if (!incoming) {
      return { area, type: "unchanged" as const, currentRoleLabel: currentRole?.label ?? null };
    }
    if (!currentRole) {
      return {
        area,
        type: "added" as const,
        incomingRoleLabel: incoming.label,
      };
    }
    if (incoming.priority > currentRole.priority) {
      return {
        area,
        type: "upgrade" as const,
        currentRoleLabel: currentRole.label,
        incomingRoleLabel: incoming.label,
      };
    }
    if (incoming.priority < currentRole.priority) {
      return {
        area,
        type: "downgrade" as const,
        currentRoleLabel: currentRole.label,
        incomingRoleLabel: incoming.label,
      };
    }
    return {
      area,
      type: "unchanged" as const,
      currentRoleLabel: currentRole.label,
    };
  });
}

interface PermissionsPanelProps {
  userId: string;
  onChanged?: () => void;
}

export function PermissionsPanel({ userId, onChanged }: PermissionsPanelProps) {
  const [value, setValue] = useState<UserRolesListValue>({});
  const [groups, setGroups] = useState<AdminGroup[]>([]);
  const [areas, setAreas] = useState<AreaSummary[]>([]);
  const [userGroupIds, setUserGroupIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickGroupId, setPickGroupId] = useState("");
  const [pickReplace, setPickReplace] = useState(true);
  const [pickPending, setPickPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refreshAssignments = useCallback(() => {
    return adminUserService
      .listAreaAssignments(userId)
      .then((res) => {
        const map: UserRolesListValue = {};
        for (const a of res.assignments) map[a.areaId] = a.roleName;
        setValue(map);
      });
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      refreshAssignments(),
      adminGroupService.list().then((r) => {
        if (cancelled) return;
        setGroups(r.groups);
        const ownGroups = new Set<string>();
        for (const g of r.groups) {
          if (g.members.some((m) => m.id === userId)) ownGroups.add(g.id);
        }
        setUserGroupIds(ownGroups);
      }),
      permissionAreaService.list().then((r) => {
        if (!cancelled) setAreas(r.areas);
      }),
    ])
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się pobrać uprawnień",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshAssignments]);

  const persist = useCallback(
    async (areaId: string, roleName: string | null) => {
      await adminUserService.setAreaRole(userId, { areaId, roleName });
      onChanged?.();
    },
    [userId, onChanged],
  );

  const selectedPickGroup = useMemo(
    () => groups.find((g) => g.id === pickGroupId) ?? null,
    [groups, pickGroupId],
  );

  const assignGroup = useCallback(async () => {
    if (!pickGroupId) return;
    setPickPending(true);
    setError(null);
    try {
      await adminGroupService.bulkAssign({
        userIds: [userId],
        groupId: pickGroupId,
        replace: pickReplace,
      });
      const groupName = selectedPickGroup?.name ?? "grupa";
      setNotice(
        pickReplace
          ? `User przypisany do "${groupName}", inne grupy usunięte`
          : `User dodany do "${groupName}"`,
      );
      // Re-fetch grupy + role (composite z grupy odzwierciedlają się w sesji
      // dopiero przy następnym tokenie, ale UI musi pokazać nowe).
      const r = await adminGroupService.list();
      setGroups(r.groups);
      const ownGroups = new Set<string>();
      for (const g of r.groups) {
        if (g.members.some((m) => m.id === userId)) ownGroups.add(g.id);
      }
      setUserGroupIds(ownGroups);
      setPickGroupId("");
      onChanged?.();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Nie udało się przypisać",
      );
    } finally {
      setPickPending(false);
    }
  }, [pickGroupId, pickReplace, userId, selectedPickGroup, onChanged]);

  const removeFromGroup = useCallback(
    async (g: AdminGroup) => {
      if (!window.confirm(`Usunąć użytkownika z grupy "${g.name}"?`)) return;
      try {
        await adminGroupService.removeMember(g.id, userId);
        setUserGroupIds((p) => {
          const n = new Set(p);
          n.delete(g.id);
          return n;
        });
        setNotice(`Usunięto z grupy "${g.name}"`);
      } catch (err) {
        setError(
          err instanceof ApiRequestError ? err.message : "Nie udało się usunąć",
        );
      }
    },
    [userId],
  );

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  if (loading) {
    return (
      <Card padding="md">
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Ładowanie uprawnień…
        </div>
      </Card>
    );
  }

  const userGroups = groups.filter((g) => userGroupIds.has(g.id));

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <Card padding="md">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="text-sm font-medium text-[var(--text-main)] flex items-center gap-2">
              <Users className="w-4 h-4" aria-hidden="true" />
              Grupy Keycloak
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Grupa nadaje wszystkie role swojego mappingu — najszybszy sposób
              przypisania persony (Administrator, Sprzedawca, Serwisant).
            </p>
          </div>
        </div>

        {userGroups.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {userGroups.map((g) => (
              <div
                key={g.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--border-subtle)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--text-main)]">
                    {g.name}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {g.realmRoles.slice(0, 8).map((r) => (
                      <Badge key={r} tone="neutral" className="text-[10px] font-mono">
                        {r}
                      </Badge>
                    ))}
                    {g.realmRoles.length > 8 && (
                      <span className="text-[10px] text-[var(--text-muted)]">
                        +{g.realmRoles.length - 8}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void removeFromGroup(g)}
                  className="text-red-500 hover:text-red-600"
                >
                  Usuń
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
          <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
            Przypisz nową grupę
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={pickGroupId}
              onChange={(e) => setPickGroupId(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm"
            >
              <option value="">— wybierz grupę —</option>
              {groups
                .filter((g) => !userGroupIds.has(g.id))
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {g.realmRoles.length > 0
                      ? ` (${g.realmRoles.length} ról)`
                      : ""}
                  </option>
                ))}
            </select>
            <Button
              onClick={() => void assignGroup()}
              loading={pickPending}
              disabled={!pickGroupId}
              leftIcon={<Shield className="w-4 h-4" aria-hidden="true" />}
            >
              Przypisz
            </Button>
          </div>
          {selectedPickGroup && areas.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">
                Podgląd zmian po przypisaniu — zatwierdź &bdquo;Przypisz&rdquo; lub anuluj wyborem &bdquo;— wybierz —&rdquo;
              </p>
              {computeGroupDiff(value, selectedPickGroup.realmRoles, areas).map((d) => {
                const cls =
                  d.type === "added"
                    ? "border-blue-500/50 bg-blue-500/10"
                    : d.type === "upgrade"
                      ? "border-green-500/50 bg-green-500/10"
                      : d.type === "downgrade"
                        ? "border-red-500/50 bg-red-500/10"
                        : "border-[var(--border-subtle)]";
                const label =
                  d.type === "added"
                    ? `+ ${d.incomingRoleLabel}`
                    : d.type === "upgrade"
                      ? `${d.currentRoleLabel} → ${d.incomingRoleLabel}`
                      : d.type === "downgrade"
                        ? `${d.currentRoleLabel} → ${d.incomingRoleLabel}`
                        : d.currentRoleLabel ?? "—";
                return (
                  <div
                    key={d.area.id}
                    className={`flex items-center justify-between gap-2 px-3 py-1.5 rounded-md border ${cls}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[var(--text-main)]">
                        {d.area.label}
                      </div>
                      <div className="text-xs text-[var(--text-muted)] truncate">
                        {d.area.description}
                      </div>
                    </div>
                    <Badge
                      tone={
                        d.type === "added"
                          ? "info"
                          : d.type === "upgrade"
                            ? "success"
                            : d.type === "downgrade"
                              ? "danger"
                              : "neutral"
                      }
                      className="text-[10px] whitespace-nowrap"
                    >
                      {label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
          <label className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={pickReplace}
              onChange={(e) => setPickReplace(e.target.checked)}
              className="mt-0.5 rounded border-[var(--border-subtle)]"
            />
            <span>
              Nadpisz inne grupy (zostanie tylko ta) — pozwala wymusić personę
            </span>
          </label>
        </div>
      </Card>

      <UserRolesList
        value={value}
        onChange={setValue}
        onPersist={persist}
        showNativeAdminUrl
      />

      <DocumensoMembershipSection userId={userId} />
      <ChatwootInboxSection userId={userId} />
      <MoodleCourseSection userId={userId} />
    </div>
  );
}

// ── Chatwoot inboxes ───────────────────────────────────────────────────────
function ChatwootInboxSection({ userId }: { userId: string }) {
  const [allInboxes, setAllInboxes] = useState<ChatwootInbox[]>([]);
  const [assigned, setAssigned] = useState<Set<number>>(new Set());
  const [chatwootUserId, setChatwootUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await chatwootInboxService.list(userId);
      setAllInboxes(r.allInboxes);
      setAssigned(new Set(r.assignedInboxIds));
      setChatwootUserId(r.chatwootUserId);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Nie udało się pobrać");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = useCallback(
    async (inbox: ChatwootInbox) => {
      setPending(inbox.id);
      setError(null);
      try {
        if (assigned.has(inbox.id)) {
          await chatwootInboxService.remove(userId, inbox.id);
        } else {
          await chatwootInboxService.add(userId, inbox.id);
        }
        await refresh();
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Operacja zawiodła");
      } finally {
        setPending(null);
      }
    },
    [userId, assigned, refresh],
  );

  if (loading) {
    return (
      <Card padding="md">
        <Loader2 className="w-4 h-4 animate-spin inline-block" aria-hidden="true" />
      </Card>
    );
  }

  return (
    <Card padding="md">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-[var(--text-main)] flex items-center gap-2">
          <MessageSquare className="w-4 h-4" aria-hidden="true" />
          Chatwoot — kanały (inboxes)
        </h3>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Każdy zaznaczony kanał daje user dostęp do rozmów z tego inboxa.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {chatwootUserId === null ? (
        <Alert tone="info">
          User nie zalogował się jeszcze do Chatwoota. Po pierwszym logowaniu
          przez SSO bridge, kanały będą tu przypisywane.
        </Alert>
      ) : allInboxes.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Brak kanałów w Chatwoocie. Najpierw utwórz kanał w
          <span className="font-mono"> /app/accounts/1/inboxes</span>.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {allInboxes.map((i) => {
            const has = assigned.has(i.id);
            return (
              <li
                key={i.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--border-subtle)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--text-main)]">
                    {i.name}
                  </div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {i.channel_type.replace("Channel::", "")}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={has ? "secondary" : "primary"}
                  onClick={() => void toggle(i)}
                  loading={pending === i.id}
                  disabled={pending !== null}
                >
                  {has ? "Usuń" : "Przypisz"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ── Moodle courses ─────────────────────────────────────────────────────────
function MoodleCourseSection({ userId }: { userId: string }) {
  const [allCourses, setAllCourses] = useState<MoodleCourseRow[]>([]);
  const [enrolled, setEnrolled] = useState<Set<number>>(new Set());
  const [moodleUserId, setMoodleUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await moodleCourseService.list(userId);
      setAllCourses(r.allCourses);
      setEnrolled(new Set(r.enrolledCourseIds));
      setMoodleUserId(r.moodleUserId);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Nie udało się pobrać");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = useCallback(
    async (course: MoodleCourseRow) => {
      setPending(course.id);
      setError(null);
      try {
        if (enrolled.has(course.id)) {
          await moodleCourseService.remove(userId, course.id);
        } else {
          await moodleCourseService.add(userId, course.id);
        }
        await refresh();
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Operacja zawiodła");
      } finally {
        setPending(null);
      }
    },
    [userId, enrolled, refresh],
  );

  if (loading) {
    return (
      <Card padding="md">
        <Loader2 className="w-4 h-4 animate-spin inline-block" aria-hidden="true" />
      </Card>
    );
  }

  return (
    <Card padding="md">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-[var(--text-main)] flex items-center gap-2">
          <GraduationCap className="w-4 h-4" aria-hidden="true" />
          Akademia (Moodle) — kursy
        </h3>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Zapisanie usera do kursu daje dostęp jako student. Wymaga aby kurs
          miał metodę zapisu &bdquo;manual&rdquo; włączoną w Moodle.
        </p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {moodleUserId === null ? (
        <Alert tone="info">
          User nie zalogował się jeszcze do Moodle.
        </Alert>
      ) : allCourses.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Brak kursów.</p>
      ) : (
        <ul className="space-y-1.5">
          {allCourses.map((c) => {
            const has = enrolled.has(c.id);
            return (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--border-subtle)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--text-main)]">
                    {c.fullname}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] flex items-center gap-2">
                    <span className="font-mono">{c.shortname}</span>
                    {c.visible === 0 && (
                      <Badge tone="warning" className="text-[10px]">ukryty</Badge>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={has ? "secondary" : "primary"}
                  onClick={() => void toggle(c)}
                  loading={pending === c.id}
                  disabled={pending !== null}
                >
                  {has ? "Wypisz" : "Zapisz"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ── Documenso multi-org membership ─────────────────────────────────────────
function DocumensoMembershipSection({ userId }: { userId: string }) {
  const [allOrgs, setAllOrgs] = useState<DocumensoOrganisation[]>([]);
  const [memberships, setMemberships] = useState<DocumensoMembership[]>([]);
  const [documensoUserId, setDocumensoUserId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingOrg, setPendingOrg] = useState<string | null>(null);
  const [pickOrg, setPickOrg] = useState("");
  const [pickRole, setPickRole] = useState<"MEMBER" | "MANAGER" | "ADMIN">("MEMBER");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await documensoMembershipService.list(userId);
      setAllOrgs(r.allOrganisations);
      setMemberships(r.memberships);
      setDocumensoUserId(r.documensoUserId);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Nie udało się pobrać",
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAdd = useCallback(async () => {
    if (!pickOrg) return;
    setPendingOrg(pickOrg);
    setError(null);
    try {
      await documensoMembershipService.add(userId, pickOrg, pickRole);
      setPickOrg("");
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.message : "Nie udało się dodać",
      );
    } finally {
      setPendingOrg(null);
    }
  }, [userId, pickOrg, pickRole, refresh]);

  const handleRemove = useCallback(
    async (orgId: string, orgName: string) => {
      if (!window.confirm(`Usunąć usera z organizacji "${orgName}"?`)) return;
      setPendingOrg(orgId);
      setError(null);
      try {
        await documensoMembershipService.remove(userId, orgId);
        await refresh();
      } catch (err) {
        setError(
          err instanceof ApiRequestError ? err.message : "Nie udało się usunąć",
        );
      } finally {
        setPendingOrg(null);
      }
    },
    [userId, refresh],
  );

  const memberOrgIds = useMemo(
    () => new Set(memberships.map((m) => m.organisationId)),
    [memberships],
  );
  const availableOrgs = useMemo(
    () => allOrgs.filter((o) => !memberOrgIds.has(o.id)),
    [allOrgs, memberOrgIds],
  );

  if (loading) {
    return (
      <Card padding="md">
        <Loader2 className="w-4 h-4 animate-spin inline-block" aria-hidden="true" />
      </Card>
    );
  }

  return (
    <Card padding="md">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-[var(--text-main)] flex items-center gap-2">
          <FileSignature className="w-4 h-4" aria-hidden="true" />
          Documenso — organizacje i zespoły
        </h3>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Przypisanie do organizacji daje user dostęp do wszystkich zespołów
          tej organizacji (z odpowiednią rolą zespołową). Można przypisać do
          wielu organizacji.
        </p>
      </div>

      {error && (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {documensoUserId === null && (
        <Alert tone="info">
          User nie ma jeszcze konta w Documenso — zostanie utworzone
          automatycznie przy pierwszym przypisaniu poniżej (pre-provisioning).
          Po jego pierwszym SSO-loginie OIDC złączy się z istniejącym
          rekordem po emailu.
        </Alert>
      )}

      {memberships.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {memberships.map((m) => {
            const org = allOrgs.find((o) => o.id === m.organisationId);
            return (
              <div
                key={m.organisationId}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--border-subtle)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--text-main)]">
                    {m.organisationName}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {m.organisationRole && (
                      <Badge tone="info" className="text-[10px]">
                        {m.organisationRole}
                      </Badge>
                    )}
                    {org?.teams.map((t) => (
                      <Badge key={t.id} tone="neutral" className="text-[10px]">
                        {t.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleRemove(m.organisationId, m.organisationName)}
                  loading={pendingOrg === m.organisationId}
                  disabled={pendingOrg === m.organisationId}
                  className="text-red-500 hover:text-red-600"
                >
                  Usuń
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {availableOrgs.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
          <div className="text-xs uppercase tracking-wider text-[var(--text-muted)]">
            Dodaj do organizacji
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={pickOrg}
              onChange={(e) => setPickOrg(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm"
            >
              <option value="">— organizacja —</option>
              {availableOrgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.teams.length} zesp.)
                </option>
              ))}
            </select>
            <select
              value={pickRole}
              onChange={(e) =>
                setPickRole(e.target.value as "MEMBER" | "MANAGER" | "ADMIN")
              }
              className="px-3 py-2 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-sm"
            >
              <option value="MEMBER">Member</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
            <Button
              onClick={() => void handleAdd()}
              disabled={!pickOrg || pendingOrg !== null}
              loading={pendingOrg === pickOrg}
              leftIcon={<Shield className="w-4 h-4" aria-hidden="true" />}
            >
              Dodaj
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
