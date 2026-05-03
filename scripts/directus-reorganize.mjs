#!/usr/bin/env node
/**
 * Wave 22 / F18 — Directus reorganization (idempotent, deterministic).
 *
 * Cel: enforce content-tree foldery, display templates, archive_field/sort_field
 * oraz pole `brand` na `mp_locations` (F1 follow-up). Skrypt jest idempotentny —
 * można re-runować bez efektów ubocznych. Re-run = zero changes.
 *
 * Architektura:
 *   - Foldery: schema-less collections (`mp_folder_*`) służą jako gniazda
 *     nawigacji w Directusie. Każda kolekcja ma `meta.group` ustawiony na
 *     odpowiedni folder slug.
 *   - Per-collection: PATCH `/collections/:c` z `meta.{group, display_template,
 *     archive_field, sort_field, icon, note}` jeśli różni się od stanu bieżącego.
 *   - Brand field: POST `/fields/mp_locations` jeśli pole `brand` nie istnieje.
 *
 * Uwaga: manifest poniżej JEST mirrorem `lib/directus-cms/specs/*.ts`. Jeśli
 * zmienisz `group` / `display_template` w specs, zaktualizuj też ten manifest.
 * Specs pozostają SoT dla runtime'u dashboardu (`ensureCollection`); ten skrypt
 * to ops-only reorg który operuje przeciwko żywej instancji Directus.
 *
 * Użycie:
 *   node scripts/directus-reorganize.mjs --env staging --dry-run
 *   node scripts/directus-reorganize.mjs --env staging
 *   node scripts/directus-reorganize.mjs --env prod
 *   node scripts/directus-reorganize.mjs --env staging --apply-permissions
 *
 * Env vars (override) — można też ustawić bez --env:
 *   DIRECTUS_URL=https://cms.myperformance.pl
 *   DIRECTUS_ADMIN_TOKEN=<static admin token>
 *
 * Z --env staging|prod skrypt wczyta `.env.<env>` z głównego katalogu projektu
 * (cd $(git rev-parse --show-toplevel)) jeśli istnieje. To NIE zapisuje envów
 * do procesów dziecięcych — jedynie chmod-le konfigurację Directusa.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Args parsing
// ---------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const ENV = args.env ?? "staging";
const DRY_RUN = args["dry-run"] === true;
const APPLY_PERMISSIONS = args["apply-permissions"] === true;

if (!["staging", "prod"].includes(ENV)) {
  console.error(`[reorganize] --env must be 'staging' or 'prod' (got '${ENV}')`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Env loading: .env.<env> overlay (only DIRECTUS_* keys are honored)
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const ENV_FILE = resolve(REPO_ROOT, `.env.${ENV}`);

if (existsSync(ENV_FILE)) {
  const raw = readFileSync(ENV_FILE, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, k, vRaw] = m;
    if (!k.startsWith("DIRECTUS_")) continue;
    if (process.env[k]) continue; // shell wins
    let v = vRaw;
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
  console.log(`[reorganize] loaded env overlay from ${ENV_FILE}`);
} else {
  console.log(`[reorganize] no ${ENV_FILE} (skipping overlay; using process env)`);
}

const DIRECTUS_URL = requireEnv("DIRECTUS_URL");
const DIRECTUS_TOKEN = process.env.DIRECTUS_ADMIN_TOKEN ?? process.env.DIRECTUS_TOKEN;
if (!DIRECTUS_TOKEN) {
  console.error("[reorganize] Missing DIRECTUS_ADMIN_TOKEN (or DIRECTUS_TOKEN) env");
  process.exit(2);
}

console.log(
  `[reorganize] env=${ENV} url=${DIRECTUS_URL} dry_run=${DRY_RUN} apply_permissions=${APPLY_PERMISSIONS}`,
);

// ---------------------------------------------------------------------------
// Folder collections (schema-less navigation buckets in Directus)
// ---------------------------------------------------------------------------
const FOLDERS = [
  { slug: "mp_folder_dashboard", label: "Dashboard", icon: "dashboard", note: "Kafelki dashboardu, banery, ogłoszenia." },
  { slug: "mp_folder_email", label: "Email", icon: "mail", note: "Branding, layouts, szablony, profile SMTP." },
  { slug: "mp_folder_panele", label: "Panele", icon: "view_list", note: "Lokalizacje, panele cert-gated, widoki publiczne." },
  { slug: "mp_folder_serwis", label: "Serwis", icon: "build", note: "Zlecenia, reklamacje, części, transport, dokumenty." },
  { slug: "mp_folder_business", label: "Biznes", icon: "trending_up", note: "Grupy targetowe, progi, cennik." },
  { slug: "mp_folder_akademia", label: "Akademia / Knowledge", icon: "school", note: "Mirror Moodle / Outline (read-only). Folder przygotowany pod przyszłe mirror-y." },
  { slug: "mp_folder_system", label: "System", icon: "settings", note: "Audit logs, certyfikaty, blokady IP, infra mirrors." },
];

// ---------------------------------------------------------------------------
// Manifest — mirror specs/*.ts (group + key meta) — keep in sync.
// Source: lib/directus-cms/specs/{cms-mirrors,cms-content,services-core,
//   services-extras,business,system}.ts
// ---------------------------------------------------------------------------
const COLLECTIONS = [
  // Dashboard
  { collection: "mp_app_catalog", group: "mp_folder_dashboard", display_template: "{{title}}", sort_field: "title", icon: "apps" },
  { collection: "mp_announcements", group: "mp_folder_dashboard", display_template: "{{severity}} • {{title}}", sort_field: "sort_order", archive_field: "is_active", icon: "campaign" },
  { collection: "mp_links", group: "mp_folder_dashboard", display_template: "{{label}} ({{category}})", sort_field: "sort", archive_field: "enabled", icon: "link" },

  // Email
  { collection: "mp_branding_cms", group: "mp_folder_email", display_template: "Branding ({{accent_color}})", icon: "palette" },
  { collection: "mp_email_templates_cms", group: "mp_folder_email", display_template: "{{kind}}: {{subject}}", sort_field: "kind", icon: "mail" },
  { collection: "mp_email_layouts_cms", group: "mp_folder_email", display_template: "{{name}}{{is_default ? ' • domyślny' : ''}}", sort_field: "name", icon: "view_quilt" },
  { collection: "mp_smtp_configs_cms", group: "mp_folder_email", display_template: "{{alias}} → {{host}}:{{port}}", sort_field: "alias", icon: "mail_outline" },

  // Panele
  { collection: "mp_locations", group: "mp_folder_panele", display_template: "{{name}} — {{type}} ({{address}})", sort_field: "name", archive_field: "enabled", icon: "place" },
  { collection: "mp_panels_cms", group: "mp_folder_panele", display_template: "{{label}} ({{domain}})", sort_field: "sort", archive_field: "enabled", icon: "view_list" },

  // Biznes
  { collection: "mp_target_groups", group: "mp_folder_business", display_template: "{{label}} ({{code}})", sort_field: "sort", archive_field: "enabled", icon: "category" },
  { collection: "mp_target_thresholds", group: "mp_folder_business", display_template: "{{group}}: {{from_value}}–{{to_value}} → {{value}}", sort_field: "from_value", icon: "tune" },
  { collection: "mp_repair_types", group: "mp_folder_business", display_template: "{{label}} ({{code}})", sort_field: "sort_order", archive_field: "is_active", icon: "build" },
  { collection: "mp_pricelist", group: "mp_folder_business", display_template: "{{name}} ({{category}}) — {{price}} PLN", sort_field: "sort", archive_field: "enabled", icon: "sell" },

  // Serwis
  { collection: "mp_services", group: "mp_folder_serwis", display_template: "{{ticket_number}} — {{customer_last_name}} — {{status}}", sort_field: "-created_at", archive_field: "status", icon: "build" },
  { collection: "mp_claims", group: "mp_folder_serwis", display_template: "{{customer_last_name}}, {{product_name}} — {{status}}", sort_field: "-created_at", icon: "report_problem" },
  { collection: "mp_protections", group: "mp_folder_serwis", display_template: "{{brand}} {{model}} ({{imei}})", sort_field: "-created_at", icon: "shield" },
  { collection: "mp_service_revisions", group: "mp_folder_serwis", display_template: "{{ticket_number}} — {{edited_by_name}} ({{created_at}})", sort_field: "-created_at", icon: "history" },
  { collection: "mp_transport_jobs", group: "mp_folder_serwis", display_template: "{{job_number}} — {{status}}", sort_field: "-created_at", icon: "local_shipping" },
  { collection: "mp_service_part_orders", group: "mp_folder_serwis", display_template: "{{ticket_number}} — {{part_name}} ({{status}})", sort_field: "-ordered_at", icon: "inventory_2" },
  { collection: "mp_service_photos", group: "mp_folder_serwis", display_template: "{{ticket_number}} — {{stage}} ({{uploaded_at}})", sort_field: "-uploaded_at", icon: "photo_library" },
  { collection: "mp_service_quote_history", group: "mp_folder_serwis", display_template: "{{ticket_number}} — Δ {{delta}} PLN ({{changed_at}})", sort_field: "-changed_at", icon: "history_toggle_off" },
  { collection: "mp_service_annexes", group: "mp_folder_serwis", display_template: "{{ticket_number}} — Δ {{delta_amount}} PLN ({{acceptance_status}})", sort_field: "-created_at", icon: "post_add" },
  { collection: "mp_service_components", group: "mp_folder_serwis", display_template: "{{ticket_number}} — {{name}} ({{cost_net}} PLN)", sort_field: "-created_at", icon: "memory" },
  { collection: "mp_service_documents", group: "mp_folder_serwis", display_template: "{{ticket_number}} — {{title}} ({{status}})", sort_field: "-created_at", icon: "description" },
  { collection: "mp_service_release_codes", group: "mp_folder_serwis", display_template: "{{ticket_number}} ({{sent_via}})", sort_field: "-created_at", icon: "vpn_key" },
  { collection: "mp_service_internal_notes", group: "mp_folder_serwis", display_template: "{{ticket_number}} — {{author_name}} ({{created_at}})", sort_field: "-created_at", icon: "sticky_note_2" },
  { collection: "mp_service_customer_contacts", group: "mp_folder_serwis", display_template: "{{ticket_number}} — {{channel}} ({{contacted_at}})", sort_field: "-contacted_at", icon: "support_agent" },

  // System
  { collection: "mp_areas_registry", group: "mp_folder_system", display_template: "{{label}} ({{provider}})", sort_field: "label", icon: "shield" },
  { collection: "mp_notif_events_registry", group: "mp_folder_system", display_template: "{{label}} — {{category}}", sort_field: "category", icon: "notifications" },
  { collection: "mp_certificates_cms", group: "mp_folder_system", display_template: "{{subject}} ({{email}})", sort_field: "issued_at", archive_field: "revoked_at", icon: "verified_user" },
  { collection: "mp_blocked_ips_cms", group: "mp_folder_system", display_template: "{{ip}} — {{country}} ({{attempts}}×)", sort_field: "blocked_at", icon: "block" },
  { collection: "mp_ovh_config_cms", group: "mp_folder_system", display_template: "OVH ({{endpoint}}) — {{configured ? 'OK' : 'brak'}}", icon: "cloud" },
  { collection: "mp_user_signatures", group: "mp_folder_system", display_template: "{{user_email}} — {{signed_name}}", sort_field: "-updated_at", icon: "draw" },
  { collection: "mp_service_actions", group: "mp_folder_system", display_template: "{{action}} — {{ticket_number}} ({{created_at}})", sort_field: "-created_at", icon: "fact_check" },
];

// Brand field on mp_locations (Wave 22 / F1 follow-up).
const BRAND_FIELD = {
  field: "brand",
  type: "string",
  schema: { is_nullable: true, max_length: 32 },
  meta: {
    interface: "select-dropdown",
    width: "half",
    display: "labels",
    display_options: {
      showAsDot: true,
      choices: [
        { text: "MyPerformance", value: "myperformance", foreground: "#fff", background: "#0F172A" },
        { text: "Zlecenie Serwisowe", value: "zlecenieserwisowe", foreground: "#fff", background: "#0EA5E9" },
      ],
    },
    options: {
      allowNone: true,
      choices: [
        { text: "MyPerformance", value: "myperformance" },
        { text: "Zlecenie Serwisowe (Caseownia)", value: "zlecenieserwisowe" },
      ],
    },
    note: "Brand mailowy — z którego SMTP profile + layout idą maile klienta. Puste = globalny default z mp_branding.default_smtp_profile_slug.",
  },
};

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------
async function api(path, init = {}) {
  const url = `${DIRECTUS_URL.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${DIRECTUS_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, body };
}

// ---------------------------------------------------------------------------
// Diff helpers
// ---------------------------------------------------------------------------
const META_KEYS_FOR_DIFF = [
  "group",
  "display_template",
  "archive_field",
  "sort_field",
  "icon",
  "note",
];

function metaDiff(currentMeta, desired) {
  const diff = {};
  for (const k of META_KEYS_FOR_DIFF) {
    if (desired[k] === undefined) continue;
    const cur = currentMeta?.[k] ?? null;
    const want = desired[k];
    if (cur !== want) {
      diff[k] = { current: cur, desired: want };
    }
  }
  return diff;
}

// ---------------------------------------------------------------------------
// Folder ops
// ---------------------------------------------------------------------------
async function ensureFolder(folder) {
  const probe = await api(`/collections/${folder.slug}`);
  if (probe.ok) {
    // Reconcile meta only — folders are schema-less, no fields to manage.
    const desired = {
      icon: folder.icon,
      note: folder.note,
      collapse: "open",
      group: null,
    };
    const cur = probe.body?.data?.meta ?? {};
    const diff = {};
    for (const k of Object.keys(desired)) {
      if (cur[k] !== desired[k]) diff[k] = { current: cur[k] ?? null, desired: desired[k] };
    }
    if (Object.keys(diff).length === 0) {
      console.log(`[folder] ${folder.slug} OK`);
      return;
    }
    console.log(`[folder] ${folder.slug} diff: ${JSON.stringify(diff)}`);
    if (DRY_RUN) return;
    const patch = await api(`/collections/${folder.slug}`, {
      method: "PATCH",
      body: JSON.stringify({ meta: { ...cur, ...desired } }),
    });
    if (!patch.ok) {
      throw new Error(`folder PATCH ${folder.slug}: ${patch.status} ${JSON.stringify(patch.body)}`);
    }
    console.log(`[folder] ${folder.slug} updated`);
    return;
  }
  if (probe.status !== 403 && probe.status !== 404) {
    throw new Error(`folder probe ${folder.slug}: ${probe.status} ${JSON.stringify(probe.body)}`);
  }
  console.log(`[folder] ${folder.slug} MISSING — will create`);
  if (DRY_RUN) return;
  const create = await api(`/collections`, {
    method: "POST",
    body: JSON.stringify({
      collection: folder.slug,
      meta: {
        icon: folder.icon,
        note: folder.note,
        collapse: "open",
        group: null,
        accountability: "all",
      },
      // Schema-less = nawigacja folder w Directus (no underlying table).
      schema: null,
    }),
  });
  if (!create.ok) {
    throw new Error(`folder create ${folder.slug}: ${create.status} ${JSON.stringify(create.body)}`);
  }
  console.log(`[folder] ${folder.slug} created`);
}

// ---------------------------------------------------------------------------
// Collection ops
// ---------------------------------------------------------------------------
async function reconcileCollection(spec) {
  const probe = await api(`/collections/${spec.collection}`);
  if (!probe.ok) {
    if (probe.status === 403 || probe.status === 404) {
      console.log(`[collection] ${spec.collection} NOT FOUND (skip — will be created by dashboard ensureCollection on first run)`);
      return;
    }
    throw new Error(`probe ${spec.collection}: ${probe.status} ${JSON.stringify(probe.body)}`);
  }
  const currentMeta = probe.body?.data?.meta ?? {};
  const desired = {
    group: spec.group,
    display_template: spec.display_template,
    sort_field: spec.sort_field ?? null,
    archive_field: spec.archive_field ?? null,
    icon: spec.icon,
  };
  const diff = metaDiff(currentMeta, desired);
  if (Object.keys(diff).length === 0) {
    console.log(`[collection] ${spec.collection} OK`);
    return;
  }
  console.log(`[collection] ${spec.collection} diff:`);
  for (const [k, v] of Object.entries(diff)) {
    console.log(`    ${k}: ${JSON.stringify(v.current)} → ${JSON.stringify(v.desired)}`);
  }
  if (DRY_RUN) return;
  // Merge: zachowujemy wszystkie istniejące pola meta i nadpisujemy tylko diff.
  const merged = { ...currentMeta };
  for (const [k, v] of Object.entries(diff)) merged[k] = v.desired;
  const patch = await api(`/collections/${spec.collection}`, {
    method: "PATCH",
    body: JSON.stringify({ meta: merged }),
  });
  if (!patch.ok) {
    throw new Error(`collection PATCH ${spec.collection}: ${patch.status} ${JSON.stringify(patch.body)}`);
  }
  console.log(`[collection] ${spec.collection} updated`);
}

// ---------------------------------------------------------------------------
// Brand field on mp_locations
// ---------------------------------------------------------------------------
async function ensureBrandField() {
  const probe = await api(`/fields/mp_locations/brand`);
  if (probe.ok) {
    console.log(`[field] mp_locations.brand exists — reconciling meta`);
    if (DRY_RUN) return;
    const patch = await api(`/fields/mp_locations/brand`, {
      method: "PATCH",
      body: JSON.stringify({ meta: BRAND_FIELD.meta, schema: BRAND_FIELD.schema }),
    });
    if (!patch.ok) {
      throw new Error(`field PATCH brand: ${patch.status} ${JSON.stringify(patch.body)}`);
    }
    return;
  }
  if (probe.status !== 403 && probe.status !== 404) {
    throw new Error(`field probe brand: ${probe.status} ${JSON.stringify(probe.body)}`);
  }
  console.log(`[field] mp_locations.brand MISSING — will create`);
  if (DRY_RUN) return;
  const create = await api(`/fields/mp_locations`, {
    method: "POST",
    body: JSON.stringify(BRAND_FIELD),
  });
  if (!create.ok) {
    throw new Error(`field create brand: ${create.status} ${JSON.stringify(create.body)}`);
  }
  console.log(`[field] mp_locations.brand created`);
}

// ---------------------------------------------------------------------------
// Permissions (skip-by-default, opt-in via --apply-permissions)
// ---------------------------------------------------------------------------
async function applyPermissions() {
  console.log("[permissions] resolving roles…");
  const editorRoleId = await findRoleId("editor");
  const adminRoleId = await findRoleId("admin");

  if (!editorRoleId && !adminRoleId) {
    console.log("[permissions] no editor/admin roles found — skipping");
    return;
  }

  // Editor: Dashboard + Email collections (read + create + update; no delete).
  const editorCollections = COLLECTIONS.filter(
    (c) => c.group === "mp_folder_dashboard" || c.group === "mp_folder_email",
  ).map((c) => c.collection);

  // Admin: wszystkie zarządzane przez ten skrypt + foldery.
  const adminCollections = [
    ...FOLDERS.map((f) => f.slug),
    ...COLLECTIONS.map((c) => c.collection),
  ];

  if (editorRoleId) {
    for (const c of editorCollections) {
      for (const action of ["read", "create", "update"]) {
        await ensurePermission(editorRoleId, c, action);
      }
    }
  }
  if (adminRoleId) {
    for (const c of adminCollections) {
      for (const action of ["read", "create", "update", "delete"]) {
        await ensurePermission(adminRoleId, c, action);
      }
    }
  }
}

async function findRoleId(name) {
  const res = await api(`/roles?filter[name][_eq]=${encodeURIComponent(name)}&limit=1`);
  if (!res.ok) {
    console.warn(`[permissions] roles lookup ${name}: ${res.status}`);
    return null;
  }
  const data = res.body?.data ?? [];
  return data[0]?.id ?? null;
}

async function ensurePermission(roleId, collection, action) {
  const find = await api(
    `/permissions?filter[role][_eq]=${encodeURIComponent(roleId)}&filter[collection][_eq]=${encodeURIComponent(collection)}&filter[action][_eq]=${action}&limit=1`,
  );
  if (find.ok && (find.body?.data ?? []).length > 0) {
    return; // already exists
  }
  console.log(`[permissions] grant role=${roleId} collection=${collection} action=${action}`);
  if (DRY_RUN) return;
  const create = await api(`/permissions`, {
    method: "POST",
    body: JSON.stringify({
      role: roleId,
      collection,
      action,
      permissions: {},
      validation: {},
      presets: null,
      fields: ["*"],
    }),
  });
  if (!create.ok) {
    console.warn(
      `[permissions] grant failed role=${roleId} ${collection} ${action}: ${create.status} ${JSON.stringify(create.body)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Util: arg parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") { out.help = true; continue; }
    if (a === "--dry-run") { out["dry-run"] = true; continue; }
    if (a === "--apply-permissions") { out["apply-permissions"] = true; continue; }
    if (a.startsWith("--env=")) { out.env = a.slice("--env=".length); continue; }
    if (a === "--env") { out.env = argv[++i]; continue; }
    console.error(`[reorganize] unknown arg: ${a}`);
    process.exit(2);
  }
  return out;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[reorganize] Missing required env ${name}`);
    process.exit(2);
  }
  return v;
}

function printHelp() {
  console.log(`Wave 22 / F18 — Directus reorganize (idempotent)

Użycie:
  node scripts/directus-reorganize.mjs [OPTIONS]

Opcje:
  --env staging|prod        Wczytaj overlay z .env.<env> (default: staging)
  --dry-run                 Pokaż diff bez aplikowania zmian
  --apply-permissions       Także apply role permissions (editor/admin)
  -h, --help                Pokaż tę pomoc

Env (override):
  DIRECTUS_URL              np. https://cms.myperformance.pl
  DIRECTUS_ADMIN_TOKEN      static admin token (Directus → Settings → Token)

Idempotency:
  Skrypt jest idempotentny — re-run na "czystym" Directusie zwraca zero diffów.
  Jeśli wprowadzisz zmiany w specs/*.ts, zsynchronizuj manifest w tym pliku
  (sekcja COLLECTIONS).
`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log(`[reorganize] phase 1: folders (${FOLDERS.length})`);
  for (const f of FOLDERS) {
    await ensureFolder(f);
  }

  console.log(`[reorganize] phase 2: collections meta (${COLLECTIONS.length})`);
  for (const c of COLLECTIONS) {
    await reconcileCollection(c);
  }

  console.log(`[reorganize] phase 3: brand field on mp_locations`);
  await ensureBrandField();

  if (APPLY_PERMISSIONS) {
    console.log(`[reorganize] phase 4: permissions`);
    await applyPermissions();
  } else {
    console.log(`[reorganize] phase 4: SKIPPED (use --apply-permissions to enable)`);
  }

  if (DRY_RUN) {
    console.log(`[reorganize] DONE (dry-run; no changes applied)`);
  } else {
    console.log(`[reorganize] DONE (applied to ${ENV})`);
  }
}

main().catch((err) => {
  console.error("[reorganize] FAILED:", err);
  process.exit(1);
});
