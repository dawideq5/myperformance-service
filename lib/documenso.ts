import { withExternalClient } from "@/lib/db";
import { getOptionalEnv } from "@/lib/env";
import { log } from "@/lib/logger";

const logger = log.child({ module: "documenso" });

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
  // Documenso v3 zwraca JSON {downloadUrl} (presigned S3) — fetchujemy
  // tę URL żeby otrzymać binary PDF i forward'ujemy do klienta.
  const meta = await fetch(
    `${cfg.baseUrl}/api/v1/documents/${id}/download`,
    {
      headers: { Authorization: cfg.apiKey },
      cache: "no-store",
    },
  );
  if (!meta.ok) return meta;
  const ct = meta.headers.get("content-type") ?? "";
  if (ct.startsWith("application/pdf")) {
    // Stary v1/v2 — direct PDF.
    return meta;
  }
  // v3: parse JSON, fetch downloadUrl.
  try {
    const j = (await meta.json()) as { downloadUrl?: string };
    if (!j.downloadUrl) {
      return new Response("Missing downloadUrl in Documenso response", {
        status: 502,
      });
    }
    const pdf = await fetch(j.downloadUrl, { cache: "no-store" });
    return pdf;
  } catch (err) {
    return new Response(`Download parse failed: ${String(err)}`, {
      status: 502,
    });
  }
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
export interface SignatureFieldBox {
  /** Procent strony [0-100] origin top-left. */
  pageX: number;
  pageY: number;
  pageWidth: number;
  pageHeight: number;
}

export async function createDocumentForSigning(opts: {
  title: string;
  pdfBuffer: Buffer;
  signers: { name: string; email: string; signatureBox?: SignatureFieldBox }[];
  /** Po podpisaniu klient wraca tutaj. Optional. */
  redirectUrl?: string;
  /** Email z którego idą zaproszenia. Kontrolowane przez Documenso config
   * (env SMTP_USERNAME/SMTP_FROM). Tu tylko dla audit log. */
  senderName?: string;
  /** Treść emaila do recipientów. Default: "Prosimy o podpisanie..." */
  message?: string;
}): Promise<{
  documentId: number;
  signingUrls: Array<{ email: string; url: string | null }>;
  recipients: Array<{
    id: number;
    email: string;
    token: string | null;
    signingOrder: number;
  }>;
}> {
  const cfg = getConfig();
  if (!cfg) throw new Error("Documenso not configured");

  // 1. Create draft document. Documenso v1 expects flat structure.
  // signingOrder=SEQUENTIAL: klient dostaje prośbę DOPIERO po podpisie
  // pracownika. Bez tego oboje sygnatariusze dostają emaile od razu.
  const createPayload = {
    title: opts.title,
    recipients: opts.signers.map((s, i) => ({
      name: s.name,
      email: s.email,
      role: "SIGNER",
      signingOrder: i + 1,
    })),
    meta: {
      ...(opts.redirectUrl ? { redirectUrl: opts.redirectUrl } : {}),
      subject: opts.title,
      message:
        opts.message ??
        "Prosimy o podpisanie potwierdzenia odbioru urządzenia.",
      signingOrder: "SEQUENTIAL",
      typedSignatureEnabled: true,
      drawSignatureEnabled: true,
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
  // Token recipientów jest potrzebny do auto-podpisu pracownika via trpc.
  const docDetail = await documensoFetch<{
    recipients?: {
      id: number;
      email: string;
      token?: string;
      signingOrder?: number;
    }[];
  }>(`/api/v1/documents/${docId}`);
  // Match recipientów Documenso z naszymi opts.signers po emailu (Documenso
  // może zwracać inny order niż podaliśmy). Każdy signer ma swój
  // signatureBox z rzeczywistych coords PDF (top-left origin, %).
  const signersByEmail = new Map(
    opts.signers.map((s) => [s.email.toLowerCase(), s]),
  );
  for (const rec of docDetail.recipients ?? []) {
    const matched = signersByEmail.get(rec.email.toLowerCase());
    const box = matched?.signatureBox;
    if (!box) {
      // Fallback gdy caller nie podał coords — neutralna pozycja na dole
      // strony (lewa/prawa zależnie od kolejności). Pozycje ze SignatureBox
      // mają precedence, ten branch jest tylko dla starych callsite'ów.
      const isFirst = rec.id === (docDetail.recipients?.[0]?.id ?? -1);
      await documensoFetch<unknown>(`/api/v1/documents/${docId}/fields`, {
        method: "POST",
        body: JSON.stringify({
          recipientId: rec.id,
          type: "SIGNATURE",
          pageNumber: 1,
          pageX: isFirst ? 6 : 56,
          pageY: 56,
          pageWidth: 38,
          pageHeight: 5,
        }),
      });
      continue;
    }
    await documensoFetch<unknown>(`/api/v1/documents/${docId}/fields`, {
      method: "POST",
      body: JSON.stringify({
        recipientId: rec.id,
        type: "SIGNATURE",
        pageNumber: 1,
        pageX: box.pageX,
        pageY: box.pageY,
        pageWidth: box.pageWidth,
        pageHeight: box.pageHeight,
      }),
    });
  }

  // 3. Send. Documenso v1 endpoint: POST /api/v1/documents/{id}/send
  // (nie /send-document — to było w starszych wersjach API).
  await documensoFetch<unknown>(`/api/v1/documents/${docId}/send`, {
    method: "POST",
    body: JSON.stringify({ sendEmail: true }),
  });

  // Fetch back to get signing URLs + tokens (potrzebne do autoSignAsEmployee).
  const doc = await getDocument(docId);
  const signingUrls = (doc?.recipients ?? []).map((r) => ({
    email: r.email,
    url: r.signingUrl ?? null,
  }));
  const recipientsWithTokens = (docDetail.recipients ?? []).map((r, i) => ({
    id: r.id,
    email: r.email,
    token: r.token ?? null,
    signingOrder: r.signingOrder ?? i + 1,
  }));
  log.child({ module: "documenso" }).info("document created for signing", {
    docId,
    title: opts.title,
    signers: opts.signers.length,
  });
  return { documentId: docId, signingUrls, recipients: recipientsWithTokens };
}

/** Lookup service po Documenso doc id (zapisany w mp_services.documenso_id). */
export async function findServiceByDocumentId(_docId: number): Promise<null> {
  // TODO: wymaga schema mp_services.documenso_doc_id field.
  // Webhook handler użyje tej funkcji do mapowania doc → service.
  return null;
}

/** Auto-podpisuje wszystkie pola SIGNATURE pracownika. Tryby:
 *   1. Z `employeeSignaturePngBase64` → uploaded signature (Documenso
 *      renderuje obraz PNG — pewny visual outcome).
 *   2. Bez PNG → typed signature (Documenso renderuje cursive font z
 *      `employeeFullName`).
 *
 * W obu wariantach Documenso loguje signedAt + IP w audit log. Po
 * podpisaniu wszystkich pól wywołuje completeDocumentWithToken —
 * Documenso oznacza pracownika jako signed i wysyła kolejnym recipientom
 * (klientowi) email z linkiem.
 *
 * Dlaczego trpc public route (`/api/trpc/...`) zamiast `/api/v1/...`?
 * Documenso v3 nie eksponuje sign-as-recipient w v1 API (deprecated).
 * trpc procedures `signFieldWithToken` i `completeDocumentWithToken`
 * są publiczne (token-based, bez auth) — server-side wywołanie
 * autorytetne dzięki posiadaniu employee tokena z createDocument response. */
export async function autoSignAsEmployee(opts: {
  documentId: number;
  employeeToken: string;
  employeeFullName: string;
  employeeRecipientId: number;
  /** Surowy base64 PNG (bez prefix `data:image/png;base64,`). Gdy podany,
   * Documenso renderuje obraz w polu SIGNATURE (uploaded mode). */
  employeeSignaturePngBase64?: string;
}): Promise<{ ok: boolean; signed: number; error?: string }> {
  const cfg = getConfig();
  if (!cfg) return { ok: false, signed: 0, error: "Documenso not configured" };
  // 1. Pobierz fields dokumentu. Documenso v3 NIE eksponuje
  // `/documents/{id}/fields` — pola są w response GET /documents/{id}
  // razem z recipients. Wyciągamy `fields` z głównego document detail.
  type FieldRow = { id: number; type: string; recipientId: number };
  let docDetail: { fields?: FieldRow[]; recipients?: unknown };
  try {
    docDetail = await documensoFetch<{ fields?: FieldRow[]; recipients?: unknown }>(
      `/api/v1/documents/${opts.documentId}`,
    );
  } catch (err) {
    logger.warn("autoSignAsEmployee document fetch failed", {
      docId: opts.documentId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, signed: 0, error: "Cannot fetch document" };
  }
  const fields: FieldRow[] = Array.isArray(docDetail.fields)
    ? docDetail.fields
    : [];
  const employeeFields = fields.filter(
    (f) =>
      f.recipientId === opts.employeeRecipientId &&
      (f.type === "SIGNATURE" || f.type === "FREE_SIGNATURE"),
  );
  let signed = 0;
  // 2. Każde SIGNATURE field — uploaded PNG (preferowane) lub typed.
  const usePng = !!opts.employeeSignaturePngBase64;
  for (const field of employeeFields) {
    const res = await fetch(
      `${cfg.baseUrl}/api/trpc/field.signFieldWithToken`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          json: {
            token: opts.employeeToken,
            fieldId: field.id,
            value: usePng
              ? opts.employeeSignaturePngBase64
              : opts.employeeFullName,
            isBase64: usePng,
          },
        }),
      },
    );
    if (res.ok) {
      signed++;
    } else {
      const t = await res.text().catch(() => "");
      logger.warn("autoSignAsEmployee signField failed", {
        docId: opts.documentId,
        fieldId: field.id,
        status: res.status,
        body: t.slice(0, 300),
        mode: usePng ? "uploaded-png" : "typed",
      });
    }
  }
  // 3. Complete document for employee — Documenso wyśle klientowi email.
  try {
    const res = await fetch(
      `${cfg.baseUrl}/api/trpc/recipient.completeDocumentWithToken`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          json: {
            token: opts.employeeToken,
            documentId: opts.documentId,
          },
        }),
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      logger.warn("autoSignAsEmployee complete failed", {
        docId: opts.documentId,
        status: res.status,
        body: t.slice(0, 300),
      });
      return { ok: signed > 0, signed, error: `Complete failed: ${res.status}` };
    }
  } catch (err) {
    return {
      ok: signed > 0,
      signed,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  logger.info("autoSignAsEmployee ok", {
    docId: opts.documentId,
    fieldsSigned: signed,
    employeeName: opts.employeeFullName,
  });
  return { ok: true, signed };
}

/** Wysyła przypomnienie do recipientów istniejącego dokumentu — bez
 * tworzenia nowego doc. Używane gdy klient nie podpisał i pracownik chce
 * mu przypomnieć (zamiast nowego dokumentu = duplikat). */
export async function resendDocumentReminder(
  docId: number,
  recipientIds?: number[],
): Promise<boolean> {
  try {
    let ids = recipientIds;
    if (!ids) {
      const doc = await getDocument(docId);
      ids = (doc?.recipients ?? [])
        .filter((r) => r.status !== "completed")
        .map((r) => r.id);
    }
    if (!ids || ids.length === 0) return false;
    await documensoFetch<unknown>(`/api/v1/documents/${docId}/resend`, {
      method: "POST",
      body: JSON.stringify({ recipients: ids }),
    });
    return true;
  } catch (err) {
    logger.warn("resendDocumentReminder failed", {
      docId,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/** Usuwa dokument z Documenso (cancel signing flow). Used przy podpisie
 * papierowym — elektroniczna ścieżka anulowana, klient nie może już
 * podpisać. */
export async function deleteDocument(id: number): Promise<boolean> {
  try {
    await documensoFetch<unknown>(`/api/v1/documents/${id}`, {
      method: "DELETE",
    });
    return true;
  } catch (err) {
    logger.warn("deleteDocument failed", {
      docId: id,
      err: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
