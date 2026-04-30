"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Database,
  HardDrive,
  Loader2,
  Server,
  Shield,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  OnboardingCard,
  useConfirm,
  useToast,
} from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api-client";
import type { VpsItem } from "@/lib/services/infrastructure-service";

export function VpsPanel() {
  const [vps, setVps] = useState<VpsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [snapshotting, setSnapshotting] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { confirm, ConfirmDialogElement } = useConfirm();
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<{ vps: VpsItem[] }>(
        "/api/admin/infrastructure/vps",
      );
      setVps(r.vps);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function takeSnapshot(name: string, force = false) {
    const ok = await confirm({
      title: force
        ? `Nadpisać snapshot VPS ${name}?`
        : `Utworzyć snapshot VPS ${name}?`,
      tone: force ? "warning" : "info",
      description: force
        ? `Stary snapshot zostanie permanentnie usunięty, a nowy utworzony w jego miejsce.`
        : `OVH wykona migawkę dysku VPS — kopia stanu na ten moment, możliwa do przywrócenia z OVH Manager.`,
      consequences: [
        `Proces zajmuje 3-5 minut`,
        `VPS pozostaje w pełni dostępny podczas snapshotu`,
        `OVH limit: 1 aktywny snapshot per VPS`,
        force
          ? `poprzedni snapshot zostanie usunięty BEZ MOŻLIWOŚCI ODZYSKANIA`
          : `nowy snapshot pojawi się w polu „lastSnapshot" po odświeżeniu`,
      ],
      confirmLabel: force ? "Nadpisz snapshot" : "Utwórz snapshot",
    });
    if (!ok) return;
    setSnapshotting(name);
    setNotice(null);
    setError(null);
    try {
      const r = await api.post<
        { message: string },
        { vpsName: string; force?: boolean }
      >("/api/admin/infrastructure/snapshot", { vpsName: name, force });
      toast.success("Snapshot zlecony", r.message);
      setNotice(r.message);
      setTimeout(load, 5000);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) {
        const proceed = await confirm({
          title: "Snapshot już istnieje",
          tone: "warning",
          description: err.message,
          consequences: [
            "Stary snapshot zostanie usunięty przed utworzeniem nowego",
            "Operacja jest nieodwracalna",
          ],
          confirmLabel: "Nadpisz",
        });
        if (proceed) return takeSnapshot(name, true);
      } else {
        const msg = err instanceof ApiRequestError ? err.message : "Snapshot failed";
        toast.error("Snapshot failed", msg);
        setError(msg);
      }
    } finally {
      setSnapshotting(null);
    }
  }

  async function removeSnapshot(name: string) {
    const ok = await confirm({
      title: `Usunąć snapshot VPS ${name}?`,
      tone: "danger",
      description: "Snapshot zostanie permanentnie usunięty z OVH.",
      consequences: [
        "Operacja nieodwracalna — nie ma kosza",
        "Po usunięciu nie będzie można przywrócić VPS do tego stanu",
        "Możesz utworzyć nowy snapshot kiedy zechcesz",
      ],
      confirmLabel: "Usuń snapshot",
    });
    if (!ok) return;
    setSnapshotting(name);
    setError(null);
    setNotice(null);
    try {
      const r = await api.delete<{ message: string }>(
        `/api/admin/infrastructure/snapshot?vpsName=${encodeURIComponent(name)}`,
      );
      toast.success("Snapshot usunięty", r.message);
      setNotice(r.message);
      setTimeout(load, 3000);
    } catch (err) {
      const msg = err instanceof ApiRequestError ? err.message : "Delete failed";
      toast.error("Delete failed", msg);
      setError(msg);
    } finally {
      setSnapshotting(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card padding="md">
        <CardHeader
          icon={<Server className="w-6 h-6 text-[var(--accent)]" />}
          title="Twoje VPS w OVH Cloud"
          description="Pełne info, automated backup OVH, snapshoty manualne, lista IP. Dane pobierane live z OVH API."
        />
      </Card>

      <OnboardingCard storageKey="vps-panel" title="Trzy warstwy backupu">
        Każdej nocy <strong>OVH 22:39</strong> robi off-site full disk
        snapshot, <strong>23:00</strong> nasz cron dumpuje wszystkie bazy
        + Coolify config (28MB, 7 dni retencji), a snapshot manualny tu
        służy do <em>punktu-w-czasie przed dużą zmianą</em>. OVH limit:
        1 aktywny snapshot per VPS — przycisk {"\u201E"}Nadpisz{"\u201D"} robi delete + create.
      </OnboardingCard>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="w-4 h-4 animate-spin" /> Pobieram z OVH…
        </div>
      )}

      {vps.map((v) => (
        <Card key={v.name} padding="lg">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-semibold">
                {v.info?.displayName ?? v.name}
              </h3>
              <code className="text-[11px] text-[var(--text-muted)]">
                {v.name}
              </code>
            </div>
            {v.info?.state && (
              <Badge tone={v.info.state === "running" ? "success" : "warning"}>
                {v.info.state}
              </Badge>
            )}
          </div>

          {v.info && (
            <div className="grid sm:grid-cols-2 gap-3 text-xs mb-4">
              <Field
                label="Plan"
                value={`${v.info.model.name} (${v.info.offerType})`}
              />
              <Field label="Region" value={v.info.zone} />
              <Field
                label="CPU"
                value={`${v.info.vcore} vCPU`}
              />
              <Field
                label="RAM"
                value={`${(v.info.memoryLimit / 1024).toFixed(0)} GB`}
              />
              <Field
                label="Disk"
                value={`${v.info.model.disk} GB SSD`}
              />
              <Field label="IAM" value={v.info.iamState ?? "—"} />
            </div>
          )}

          {v.ips.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] uppercase text-[var(--text-muted)] mb-1">
                Adresy IP
              </div>
              <div className="flex flex-wrap gap-1.5">
                {v.ips.map((ip) => (
                  <code
                    key={ip}
                    className="text-[11px] bg-[var(--bg-main)] px-2 py-1 rounded"
                  >
                    {ip}
                  </code>
                ))}
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <Card padding="md" className="bg-[var(--bg-main)]">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                <h4 className="text-sm font-semibold">Automated backup OVH</h4>
              </div>
              {v.automatedBackup ? (
                <div className="text-xs space-y-1 text-[var(--text-muted)]">
                  <div>
                    Status:{" "}
                    <Badge
                      tone={
                        v.automatedBackup.state === "enabled"
                          ? "success"
                          : "warning"
                      }
                    >
                      {v.automatedBackup.state}
                    </Badge>
                  </div>
                  <div>
                    Codziennie o:{" "}
                    <code className="text-[var(--text-main)]">
                      {v.automatedBackup.schedule}
                    </code>{" "}
                    UTC
                  </div>
                  <div>
                    Retencja:{" "}
                    <strong className="text-[var(--text-main)]">
                      {v.automatedBackup.rotation}
                    </strong>{" "}
                    {v.automatedBackup.rotation === 1 ? "kopia" : "kopie"}
                  </div>
                  <p className="mt-2 text-[10px]">
                    Snapshot całego VPS na infrastrukturze OVH. Restoruje stan
                    serwera (cały dysk) — potrzebny gdy padnie cały system, nie
                    pojedyncza apka.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  Automated backup nieaktywny.
                </p>
              )}
            </Card>

            <Card padding="md" className="bg-[var(--bg-main)]">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="w-4 h-4 text-sky-400" />
                <h4 className="text-sm font-semibold">Manualny snapshot</h4>
              </div>
              {v.lastSnapshot ? (
                <div className="text-xs text-[var(--text-muted)] mb-3">
                  Ostatni:{" "}
                  <strong className="text-[var(--text-main)]">
                    {new Date(v.lastSnapshot.creationDate).toLocaleString("pl-PL")}
                  </strong>
                  <br />
                  Region:{" "}
                  <code>{v.lastSnapshot.region}</code>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  Brak snapshotu.
                </p>
              )}
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  onClick={() => takeSnapshot(v.name)}
                  loading={snapshotting === v.name}
                  fullWidth
                >
                  {v.lastSnapshot ? "Nadpisz snapshot" : "Utwórz snapshot teraz"}
                </Button>
                {v.lastSnapshot && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeSnapshot(v.name)}
                    loading={snapshotting === v.name}
                    fullWidth
                  >
                    Usuń snapshot
                  </Button>
                )}
              </div>
              <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                OVH limit: 1 aktywny snapshot per VPS. {"\u201E"}Nadpisz{"\u201D"} usuwa stary i tworzy nowy.
              </p>
            </Card>
          </div>
        </Card>
      ))}

      <Card padding="md">
        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Database className="w-4 h-4 text-amber-400" /> Backup baz danych
          (server-side)
        </h4>
        <div className="text-xs text-[var(--text-muted)] space-y-1">
          <div>
            • Codzienny pełen dump 8 baz + Coolify config + Traefik certs
          </div>
          <div>
            • Uruchamiany cronem na hoście:{" "}
            <code>/etc/cron.d/myperformance-backup</code> · 23:00 UTC
          </div>
          <div>
            • Lokalizacja:{" "}
            <code>/backups/myperformance/YYYY-MM-DD_HH-MM/</code>
          </div>
          <div>• Retencja 7 dni · email-raport po wykonaniu</div>
        </div>
        <div className="mt-3 text-[11px] text-[var(--text-muted)]">
          <strong className="text-[var(--text-main)]">
            Razem masz 3 warstwy:
          </strong>{" "}
          (1) Automated backup OVH 22:39 = full disk snapshot, off-site, off-host;
          (2) cron 23:00 = per-database dump + Coolify config; (3) snapshot
          ręczny = punkt-w-czasie przed zmianą.
        </div>
      </Card>
      {ConfirmDialogElement}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase text-[var(--text-muted)]">
        {label}
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
