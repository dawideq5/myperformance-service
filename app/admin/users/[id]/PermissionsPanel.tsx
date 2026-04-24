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
        replace: true, // zawsze nadpisuj — single-persona policy
      });
      const groupName = selectedPickGroup?.name ?? "grupa";
      setNotice(`Zapisano: ${groupName}`);
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
            {pickGroupId && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => setPickGroupId("")}
                  disabled={pickPending}
                >
                  Anuluj
                </Button>
                <Button
                  onClick={() => void assignGroup()}
                  loading={pickPending}
                  leftIcon={<Shield className="w-4 h-4" aria-hidden="true" />}
                >
                  Zapisz
                </Button>
              </>
            )}
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
          Brak kanałów w Chatwoocie.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {allInboxes.map((i) => (
            <AccessTile
              key={i.id}
              title={i.name}
              subtitle={i.channel_type.replace("Channel::", "")}
              hasAccess={assigned.has(i.id)}
              pending={pending === i.id}
              disabled={pending !== null}
              onToggle={() => void toggle(i)}
            />
          ))}
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
          {allCourses.map((c) => (
            <AccessTile
              key={c.id}
              title={c.fullname}
              subtitle={c.shortname}
              tags={c.visible === 0 ? ["ukryty"] : undefined}
              hasAccess={enrolled.has(c.id)}
              pending={pending === c.id}
              disabled={pending !== null}
              onToggle={() => void toggle(c)}
            />
          ))}
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
  const [pending, setPending] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await documensoMembershipService.list(userId);
      setAllOrgs(r.allOrganisations);
      setMemberships(r.memberships);
      setDocumensoUserId(r.documensoUserId);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Nie udało się pobrać");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const memberByOrg = useMemo(() => {
    const m = new Map<string, DocumensoMembership>();
    for (const x of memberships) m.set(x.organisationId, x);
    return m;
  }, [memberships]);

  const toggle = useCallback(
    async (orgId: string) => {
      setPending(orgId);
      setError(null);
      try {
        if (memberByOrg.has(orgId)) {
          await documensoMembershipService.remove(userId, orgId);
        } else {
          await documensoMembershipService.add(userId, orgId, "MEMBER");
        }
        await refresh();
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Operacja zawiodła");
      } finally {
        setPending(null);
      }
    },
    [userId, memberByOrg, refresh],
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
          Dokumenty (Documenso) — organizacje
        </h3>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Przyznanie dostępu = członek organizacji wraz ze wszystkimi jej zespołami.
        </p>
      </div>
      {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
      {allOrgs.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Brak organizacji.</p>
      ) : (
        <ul className="space-y-1.5">
          {allOrgs.map((o) => {
            const has = memberByOrg.has(o.id);
            return <AccessTile
              key={o.id}
              title={o.name}
              subtitle={`${o.teams.length} ${o.teams.length === 1 ? "zespół" : "zespoły"}`}
              tags={o.teams.map((t) => t.name)}
              hasAccess={has}
              pending={pending === o.id}
              disabled={pending !== null}
              onToggle={() => void toggle(o.id)}
            />;
          })}
        </ul>
      )}
      {documensoUserId === null && (
        <p className="mt-3 text-xs text-[var(--text-muted)]">
          Konto Documenso zostanie utworzone automatycznie przy pierwszym
          przypisaniu (pre-provisioning), OIDC złączy je przy pierwszym loginie.
        </p>
      )}
    </Card>
  );
}

// Reużywalny tile z toggle Dostęp / Brak — używany przez Documenso/Chatwoot/Moodle.
function AccessTile({
  title,
  subtitle,
  tags,
  hasAccess,
  pending,
  disabled,
  onToggle,
}: {
  title: string;
  subtitle?: string;
  tags?: string[];
  hasAccess: boolean;
  pending: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
        hasAccess
          ? "border-green-500/40 bg-green-500/5"
          : "border-[var(--border-subtle)]"
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-[var(--text-main)]">{title}</div>
        {subtitle && (
          <div className="text-xs text-[var(--text-muted)]">{subtitle}</div>
        )}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {tags.map((t) => (
              <Badge key={t} tone="neutral" className="text-[10px]">{t}</Badge>
            ))}
          </div>
        )}
      </div>
      <Button
        size="sm"
        variant={hasAccess ? "secondary" : "primary"}
        onClick={onToggle}
        loading={pending}
        disabled={disabled}
        className={hasAccess ? "min-w-[120px]" : "min-w-[120px]"}
      >
        {hasAccess ? "Brak dostępu" : "Daj dostęp"}
      </Button>
    </li>
  );
}
