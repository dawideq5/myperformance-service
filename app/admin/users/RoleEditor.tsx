"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Search } from "lucide-react";

import {
  Alert,
  Badge,
  Button,
  Dialog,
  FieldWrapper,
  Input,
  Textarea,
} from "@/components/ui";
import { ApiRequestError } from "@/lib/api-client";
import {
  permissionAreaService,
  type AreaDetailNativePermission,
  type AreaDetailRole,
} from "@/app/account/account-service";

interface RoleEditorProps {
  areaId: string;
  mode: "create" | "edit" | null;
  initial: AreaDetailRole | null;
  permissions: AreaDetailNativePermission[];
  onClose: () => void;
  onSaved: () => void;
}

export function RoleEditor({
  areaId,
  mode,
  initial,
  permissions,
  onClose,
  onSaved,
}: RoleEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!mode) return;
    if (mode === "create") {
      setName("");
      setDescription("");
      setSelected(new Set());
    } else if (initial) {
      setName(initial.native?.name ?? initial.kcRoleName);
      setDescription(initial.description);
      setSelected(new Set(initial.native?.permissions ?? []));
    }
    setSearch("");
    setError(null);
  }, [mode, initial]);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? permissions.filter(
          (p) =>
            p.key.toLowerCase().includes(q) ||
            p.label.toLowerCase().includes(q) ||
            p.group.toLowerCase().includes(q),
        )
      : permissions;
    const byGroup = new Map<string, AreaDetailNativePermission[]>();
    for (const p of filtered) {
      const bucket = byGroup.get(p.group) ?? [];
      bucket.push(p);
      byGroup.set(p.group, bucket);
    }
    return Array.from(byGroup.entries());
  }, [permissions, search]);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleGroup = useCallback(
    (groupKeys: string[]) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const allOn = groupKeys.every((k) => next.has(k));
        if (allOn) {
          for (const k of groupKeys) next.delete(k);
        } else {
          for (const k of groupKeys) next.add(k);
        }
        return next;
      });
    },
    [],
  );

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) {
        setError("Podaj nazwę roli");
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const perms = Array.from(selected);
        if (mode === "create") {
          await permissionAreaService.createRole(areaId, {
            name: name.trim(),
            description: description.trim() || undefined,
            permissions: perms,
          });
        } else if (initial) {
          await permissionAreaService.updateRole(areaId, initial.kcRoleName, {
            name: name.trim(),
            description: description.trim(),
            permissions: perms,
          });
        }
        onSaved();
      } catch (err) {
        setError(
          err instanceof ApiRequestError
            ? err.message
            : "Nie udało się zapisać roli",
        );
      } finally {
        setLoading(false);
      }
    },
    [name, description, selected, mode, areaId, initial, onSaved],
  );

  const open = mode !== null;
  const title =
    mode === "create"
      ? "Nowa rola"
      : initial
        ? `Edycja: ${initial.native?.name ?? initial.kcRoleName}`
        : "";
  const readOnly = initial?.native?.systemDefined ?? false;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={title}
      description={
        mode === "create"
          ? "Stwórz custom rolę w obszarze — KC role zostanie powołana automatycznie."
          : readOnly
            ? "Rola systemowa aplikacji — tylko do odczytu."
            : "Edytuj nazwę, opis i listę uprawnień."
      }
      labelledById="role-editor-title"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Anuluj
          </Button>
          <Button
            type="submit"
            form="role-editor-form"
            loading={loading}
            disabled={readOnly}
            leftIcon={<Check className="w-4 h-4" aria-hidden="true" />}
          >
            Zapisz
          </Button>
        </>
      }
    >
      <form id="role-editor-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid grid-cols-1 gap-3">
          <FieldWrapper id="role-name" label="Nazwa" required>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={readOnly}
            />
          </FieldWrapper>
          <FieldWrapper id="role-description" label="Opis">
            <Textarea
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={readOnly}
              rows={2}
            />
          </FieldWrapper>
        </div>

        {permissions.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            Provider nie zwraca listy uprawnień (read-only lub offline).
          </p>
        ) : (
          <>
            <FieldWrapper id="role-perm-search" label="Uprawnienia">
              <Input
                id="role-perm-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtruj po kluczu/grupie/etykiecie..."
                leftIcon={<Search className="w-4 h-4" aria-hidden="true" />}
              />
            </FieldWrapper>
            <div className="max-h-[45vh] overflow-y-auto space-y-3 pr-1">
              {grouped.map(([group, items]) => {
                const groupKeys = items.map((p) => p.key);
                const allOn = groupKeys.every((k) => selected.has(k));
                const someOn = groupKeys.some((k) => selected.has(k));
                return (
                  <section
                    key={group}
                    className="border border-[var(--border-subtle)] rounded-lg"
                  >
                    <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border-subtle)] bg-[var(--bg-main)]">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-[var(--text-main)]">
                          {group}
                        </span>
                        <Badge tone={allOn ? "success" : someOn ? "info" : "neutral"}>
                          {items.filter((p) => selected.has(p.key)).length}/{items.length}
                        </Badge>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleGroup(groupKeys)}
                        disabled={readOnly}
                      >
                        {allOn ? "Odznacz" : "Zaznacz wszystko"}
                      </Button>
                    </header>
                    <ul className="divide-y divide-[var(--border-subtle)]">
                      {items.map((p) => (
                        <li key={p.key} className="px-3 py-2 flex items-start gap-3">
                          <input
                            type="checkbox"
                            id={`perm-${p.key}`}
                            checked={selected.has(p.key)}
                            onChange={() => toggle(p.key)}
                            disabled={readOnly}
                            className="mt-1"
                          />
                          <label htmlFor={`perm-${p.key}`} className="flex-1 cursor-pointer">
                            <span className="block text-sm text-[var(--text-main)]">
                              {p.label}
                            </span>
                            <span className="block text-xs text-[var(--text-muted)] font-mono">
                              {p.key}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              Zaznaczone: {selected.size} / {permissions.length}
            </p>
          </>
        )}
      </form>
    </Dialog>
  );
}
