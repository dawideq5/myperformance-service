import { withExternalClient } from "@/lib/db";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

export type DocumensoStatus =
  | "draft"
  | "pending"
  | "completed"
  | "declined"
  | "expired"
  | string;

function normalizeStatus(raw: string | undefined | null): DocumensoStatus {
  switch ((raw ?? "").toUpperCase()) {
    case "COMPLETED":
      return "completed";
    case "REJECTED":
      return "declined";
    case "DRAFT":
      return "draft";
    case "EXPIRED":
      return "expired";
    default:
      return "pending";
  }
}

function normalizeRecipientStatus(raw: string | undefined | null): string {
  switch ((raw ?? "").toUpperCase()) {
    case "SIGNED":
    case "COMPLETED":
      return "completed";
    case "REJECTED":
    case "DECLINED":
      return "declined";
    case "OPENED":
      return "opened";
    case "NOT_OPENED":
    case "SENT":
      return "sent";
    default:
      return "pending";
  }
}

export interface DocumensoDocument {
  id: number;
  name: string;
  status: DocumensoStatus;
  createdAt: string;
  completedAt?: string;
  expiresAt?: string;
  recipients: Array<{
    id: number;
    email: string;
    name?: string;
    status: string;
    signedAt?: string;
    self?: boolean;
    signingUrl?: string;
  }>;
  downloadUrl?: string;
  auditLogUrl?: string;
  templateName?: string;
}

function getConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = getOptionalEnv("DOCUMENSO_URL");
  const apiKey = getOptionalEnv("DOCUMENSO_API_KEY");
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export function getDocumensoBaseUrl(): string | null {
  return getConfig()?.baseUrl ?? null;
}

export function isDocumensoConfigured() {
  return getConfig() !== null;
}

async function documensoFetch<T>(
  path: string,
  init?: RequestInit & { raw?: boolean },
): Promise<T> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Documenso not configured (DOCUMENSO_URL / DOCUMENSO_API_KEY)");
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: cfg.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Documenso ${path} → ${res.status} ${text.slice(0, 200)}`);
  }
  if (init?.raw) return res as unknown as T;
  return res.json() as Promise<T>;
}

interface RawRecipient {
  id: number;
  email: string;
  name?: string | null;
  role?: string;
  signingStatus?: string;
  readStatus?: string;
  sendStatus?: string;
  signedAt?: string | null;
  signingUrl?: string | null;
  token?: string;
}

interface RawDocument {
  id: number;
  title?: string;
  status: string;
  createdAt: string;
  completedAt?: string | null;
  updatedAt?: string;
  Recipient?: RawRecipient[];
  recipients?: RawRecipient[];
  documentMeta?: { dateFormat?: string; timezone?: string };
  templateId?: number | null;
  auditLogUrl?: string | null;
}

function normalizeRecipient(r: RawRecipient, baseUrl: string, self: boolean): DocumensoDocument["recipients"][number] {
  return {
    id: r.id,
    email: r.email,
    name: r.name ?? undefined,
    status: normalizeRecipientStatus(r.signingStatus ?? r.readStatus ?? r.sendStatus),
    signedAt: r.signedAt ?? undefined,
    self,
    signingUrl: r.signingUrl ?? (r.token ? `${baseUrl}/sign/${r.token}` : undefined),
  };
}

function normalizeDocument(raw: RawDocument, baseUrl: string, email: string | null): DocumensoDocument {
  const recipients = raw.recipients ?? raw.Recipient ?? [];
  const normEmail = email?.toLowerCase();
  const docId = raw.id;
  return {
    id: docId,
    name: raw.title ?? "Dokument",
    status: normalizeStatus(raw.status),
    createdAt: raw.createdAt,
    completedAt: raw.completedAt ?? undefined,
    recipients: recipients.map((r) =>
      normalizeRecipient(r, baseUrl, normEmail ? r.email.toLowerCase() === normEmail : false),
    ),
    downloadUrl: `/api/documents/${docId}/download`,
    auditLogUrl: raw.auditLogUrl ?? undefined,
  };
}

export async function listDocuments(): Promise<DocumensoDocument[]> {
  const cfg = getConfig();
  if (!cfg) return [];
  try {
    const data = await documensoFetch<{ documents: RawDocument[]; totalPages?: number } | RawDocument[]>(
      "/api/v1/documents?page=1&perPage=200",
    );
    const docs = Array.isArray(data) ? data : (data.documents ?? []);
    return docs.map((d) => normalizeDocument(d, cfg.baseUrl, null));
  } catch {
    return [];
  }
}

export async function listDocumentsForEmail(email: string): Promise<DocumensoDocument[]> {
  const all = await listDocuments();
  const needle = email.toLowerCase();
  return all
    .filter((d) => d.recipients.some((r) => r.email.toLowerCase() === needle))
    .map((d) => ({
      ...d,
      recipients: d.recipients.map((r) => ({ ...r, self: r.email.toLowerCase() === needle })),
    }));
}

export async function getDocument(id: number): Promise<DocumensoDocument | null> {
  const cfg = getConfig();
  if (!cfg) return null;
  try {
    const raw = await documensoFetch<RawDocument>(`/api/v1/documents/${id}`);
    return normalizeDocument(raw, cfg.baseUrl, null);
  } catch {
    return null;
  }
}

export async function downloadDocumentPdf(id: number): Promise<Response> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Documenso not configured");
  const res = await fetch(`${cfg.baseUrl}/api/v1/documents/${id}/download`, {
    headers: { Authorization: cfg.apiKey },
    cache: "no-store",
  });
  return res;
}

export interface DocumensoDocumentStats {
  total: number;
  pending: number;
  completed: number;
  declined: number;
  expired: number;
}

/**
 * Documenso role — natywny enum `Role` w DB. Mapowanie KC → Documenso:
 *   documenso_admin   → ADMIN  (pełne /admin + pełne UI)
 *   documenso_manager → USER   (pełne UI bez /admin, landing /templates)
 *   documenso_member  → USER   (pełne UI bez /admin, landing /inbox)
 *
 * Każda persona z rolą documenso_* ma dostęp do Documenso UI, różnicę
 * robi landing URL i team-level TeamMember.role.
 */
/**
 * Global Documenso role (stored in `User.roles` jako `Role[]` enum PG).
 * `ADMIN` gates access to `/admin`. Rola `USER` = standard logged-in member.
 */
export type DocumensoRole = "USER" | "ADMIN";

/**
 * Team-level Documenso role (API v2 Teams). Użytkownik w zespole może mieć
 * jedną z trzech wartości. Mapowanie z metaroli (priority-based downcasting):
 *
 *   priority >= 90 → ADMIN   (pełna kontrola zespołu + instancja-wide ADMIN)
 *   50 <= p <  90  → MANAGER (zarządza członkami o równej/niższej randze)
 *   priority <  50 → MEMBER  (wgląd do dokumentów zespołu)
 *
 * Zgodnie z raportem IAM (sekcja "Documenso — Integracja przez degradację
 * strukturalną"): nie można definiować custom ról, więc wartość wysyłamy
 * z góry zdefiniowanej enumeracji, wybierając najbliższy odpowiednik wagi.
 */
export type DocumensoTeamRole = "ADMIN" | "MANAGER" | "MEMBER";

/**
 * Downcasting metaroli do enum-u team role Documenso. `priority` pochodzi
 * z `PermissionArea.kcRoles[i].priority` w `lib/permissions/areas.ts`.
 */
export function documensoTeamRoleForPriority(
  priority: number,
): DocumensoTeamRole {
  if (priority >= 90) return "ADMIN";
  if (priority >= 50) return "MANAGER";
  return "MEMBER";
}

/**
 * Downcasting team-role → global User.roles. ADMIN team => [USER, ADMIN]
 * (otwiera /admin w Documenso), reszta => [USER].
 */
export function documensoGlobalRolesForTeamRole(
  teamRole: DocumensoTeamRole,
): DocumensoRole[] {
  return teamRole === "ADMIN" ? ["USER", "ADMIN"] : ["USER"];
}

function isDocumensoDbConfigured(): boolean {
  return getOptionalEnv("DOCUMENSO_DB_URL").trim().length > 0;
}

/**
 * Sync the Documenso `User.roles` array to match the desired global role.
 *
 * Documenso stores roles as a Postgres `Role[]` enum column; `ADMIN` gates
 * access to `/admin`. Dashboard tiles determine the intent: clicking the
 * admin tile elevates the user to `[USER, ADMIN]`, clicking the user tile
 * demotes to `[USER]`. No-op if the user has never signed into Documenso
 * (row does not exist yet — it will be created by the OIDC flow as USER
 * and synced on the next tile click).
 */
export async function syncDocumensoUserRole(
  email: string,
  role: DocumensoRole,
  name?: string | null,
): Promise<"updated" | "noop" | "skipped"> {
  if (!isDocumensoDbConfigured()) return "skipped";
  const rolesArray = role === "ADMIN" ? ["USER", "ADMIN"] : ["USER"];
  return await withExternalClient("DOCUMENSO_DB_URL", async (client) => {
    // `name` update tylko gdy podany i nie-pusty — KC jako źródło prawdy,
    // ale pomijamy puste stringi żeby przy pustym firstName/lastName w KC
    // nie wymazywać ręcznie wpisanej nazwy.
    const hasName = typeof name === "string" && name.trim().length > 0;
    // Zawsze `disabled=false` — DOCUMENSO_EMPLOYEE został wycofany
    // 2026-04-23 (wszystkie persony logują się do Documenso UI).
    const res = await client.query(
      hasName
        ? `UPDATE "User"
              SET roles = $2::"Role"[],
                  disabled = false,
                  name = $3
            WHERE LOWER(email) = LOWER($1)`
        : `UPDATE "User"
              SET roles = $2::"Role"[],
                  disabled = false
            WHERE LOWER(email) = LOWER($1)`,
      hasName
        ? [email, rolesArray, name!.trim()]
        : [email, rolesArray],
    );
    return (res.rowCount ?? 0) > 0 ? "updated" : "noop";
  });
}

export function computeDocumensoStats(docs: DocumensoDocument[]): DocumensoDocumentStats {
  let pending = 0;
  let completed = 0;
  let declined = 0;
  let expired = 0;
  for (const d of docs) {
    switch (d.status) {
      case "completed":
        completed += 1;
        break;
      case "declined":
        declined += 1;
        break;
      case "expired":
        expired += 1;
        break;
      default:
        pending += 1;
    }
  }
  return { total: docs.length, pending, completed, declined, expired };
}

/** Tworzy dokument do podpisu w Documenso z PDF buffer + listą signers.
 * Flow:
 *   1. POST /api/v1/documents — create draft + zwrot uploadUrl
 *   2. PUT do uploadUrl z PDF bytes
 *   3. POST /api/v1/documents/{id}/send-document — wysłanie email z linkami
 *
 * Zwraca documentId + signing URLs per recipient. */
export async function createDocumentForSigning(opts: {
  title: string;
  pdfBuffer: Buffer;
  signers: { name: string; email: string }[];
  /** Po podpisaniu klient wraca tutaj. Optional. */
  redirectUrl?: string;
  /** Email z którego idą zaproszenia. Kontrolowane przez Documenso config
   * (env SMTP_USERNAME/SMTP_FROM). Tu tylko dla audit log. */
  senderName?: string;
}): Promise<{
  documentId: number;
  signingUrls: Array<{ email: string; url: string | null }>;
}> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Documenso not configured");

  // 1. Create draft document. Documenso v1 expects flat structure.
  const createPayload = {
    title: opts.title,
    recipients: opts.signers.map((s, i) => ({
      name: s.name,
      email: s.email,
      role: "SIGNER",
      signingOrder: i + 1,
    })),
    meta: opts.redirectUrl
      ? {
          redirectUrl: opts.redirectUrl,
          subject: opts.title,
          message: "Prosimy o podpisanie potwierdzenia odbioru urządzenia.",
        }
      : {
          subject: opts.title,
          message: "Prosimy o podpisanie potwierdzenia odbioru urządzenia.",
        },
  };

  // Documenso v1 response: { uploadUrl: string, documentId: number, recipients: [...] }
  // (zmienione w późniejszej wersji — wcześniej było { document: { id } }).
  const created = await documensoFetch<{
    uploadUrl: string;
    documentId?: number;
    document?: { id: number; title?: string };
    recipients?: { id: number; email: string }[];
  }>("/api/v1/documents", {
    method: "POST",
    body: JSON.stringify(createPayload),
  });

  const docId = created.documentId ?? created.document?.id;
  if (!docId) {
    throw new Error(
      `Documenso create response missing documentId. Response: ${JSON.stringify(created).slice(0, 300)}`,
    );
  }

  // 2. Upload PDF to presigned uploadUrl.
  const uploadResp = await fetch(created.uploadUrl, {
    method: "PUT",
    body: new Uint8Array(opts.pdfBuffer),
    headers: { "Content-Type": "application/pdf" },
  });
  if (!uploadResp.ok) {
    throw new Error(
      `Documenso upload failed: ${uploadResp.status} ${await uploadResp.text().catch(() => "")}`,
    );
  }

  // 2b. Documenso wymaga signature field dla każdego signera. Pobieramy
  // recipients (z ich id po stronie DocumDoc) i dodajemy SIGNATURE field.
  const docDetail = await documensoFetch<{
    recipients?: { id: number; email: string }[];
  }>(`/api/v1/documents/${docId}`);
  for (const rec of docDetail.recipients ?? []) {
    // Pole na ostatniej stronie potwierdzenia, w sekcji signatures.
    // Coords w PDF coordinate system (origin bottom-left, jednostki: punkt).
    // Dla A4 595x842pt: signatures są ~88pt od dołu, lewa kolumna do x=290,
    // prawa od x=305. Pierwszy signer = pracownik (lewa), drugi = klient (prawa).
    const isFirst = rec.id === (docDetail.recipients?.[0]?.id ?? -1);
    await documensoFetch<unknown>(`/api/v1/documents/${docId}/fields`, {
      method: "POST",
      body: JSON.stringify({
        recipientId: rec.id,
        type: "SIGNATURE",
        pageNumber: 1,
        pageX: isFirst ? 8 : 55,
        pageY: 88,
        pageWidth: 32,
        pageHeight: 6,
      }),
    });
  }

  // 3. Send. Documenso v1 endpoint: POST /api/v1/documents/{id}/send
  // (nie /send-document — to było w starszych wersjach API).
  await documensoFetch<unknown>(`/api/v1/documents/${docId}/send`, {
    method: "POST",
    body: JSON.stringify({ sendEmail: true }),
  });

  // Fetch back to get signing URLs.
  const doc = await getDocument(docId);
  const signingUrls = (doc?.recipients ?? []).map((r) => ({
    email: r.email,
    url: r.signingUrl ?? null,
  }));
  log.child({ module: "documenso" }).info("document created for signing", {
    docId,
    title: opts.title,
    signers: opts.signers.length,
  });
  return { documentId: docId, signingUrls };
}

/** Lookup service po Documenso doc id (zapisany w mp_services.documenso_id). */
export async function findServiceByDocumentId(_docId: number): Promise<null> {
  // TODO: wymaga schema mp_services.documenso_doc_id field.
  // Webhook handler użyje tej funkcji do mapowania doc → service.
  return null;
}
