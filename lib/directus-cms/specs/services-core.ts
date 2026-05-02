import type { CollectionSpec } from "../types";

/**
 * MODUŁ SERWISOWY (mp_services / mp_claims / mp_protections).
 *
 * Wzorowany na schemacie referencyjnym (mperformance-master), rozszerzony o:
 *   - location m2o → mp_locations (powiązanie z punktem przyjęcia)
 *   - photos[] → URL-e zdjęć urządzenia (Directus folder "services")
 *   - transport_status → integracja z mp_transport_jobs (panel kierowcy)
 *   - chatwoot_conversation_id → link do rozmowy z klientem (auto-tworzona)
 *   - assigned_technician → email serwisanta (z Keycloak)
 */

export const SERVICES_CORE_SPECS: CollectionSpec[] = [
  {
    collection: "mp_services",
    meta: {
      icon: "build",
      note: "Zlecenia serwisowe — przyjęcia urządzeń. Cykl: przyjęty → diagnoza → naprawa → testy → gotowy → wydany. Klient kontaktowany przez Chatwoot.",
      display_template: "{{brand}} {{model}} ({{imei}}) — {{status}}",
      sort_field: "-created_at",
      archive_field: "status",
      archive_value: "archived",
      unarchive_value: "received",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "ticket_number",
        type: "string",
        schema: { is_nullable: false, is_unique: true },
        meta: {
          interface: "input",
          required: true,
          readonly: true,
          width: "half",
          options: { iconLeft: "tag", font: "monospace" },
          note: "Auto-generowany numer zgłoszenia (np. SVC-2026-04-0001).",
        },
      },
      {
        field: "status",
        type: "string",
        schema: { is_nullable: false, default_value: "received" },
        meta: {
          interface: "select-dropdown",
          required: true,
          width: "half",
          display: "labels",
          display_options: {
            showAsDot: true,
            choices: [
              { text: "Przyjęty", value: "received", foreground: "#fff", background: "#64748B" },
              { text: "Diagnoza", value: "diagnosing", foreground: "#fff", background: "#0EA5E9" },
              { text: "Wycena u klienta", value: "awaiting_quote", foreground: "#fff", background: "#F59E0B" },
              { text: "Oczekiwanie na części", value: "awaiting_parts", foreground: "#fff", background: "#D97706" },
              { text: "Naprawa", value: "repairing", foreground: "#fff", background: "#A855F7" },
              { text: "Kontrola jakości", value: "testing", foreground: "#fff", background: "#06B6D4" },
              { text: "Gotowy do odbioru", value: "ready", foreground: "#fff", background: "#22C55E" },
              { text: "Wydany", value: "delivered", foreground: "#fff", background: "#16A34A" },
              { text: "Wstrzymany", value: "on_hold", foreground: "#fff", background: "#475569" },
              { text: "Klient odmówił wyceny", value: "rejected_by_customer", foreground: "#fff", background: "#B91C1C" },
              { text: "Zwrócony bez naprawy", value: "returned_no_repair", foreground: "#fff", background: "#9CA3AF" },
              { text: "Zamknięty", value: "closed", foreground: "#fff", background: "#0F172A" },
              { text: "Anulowany", value: "cancelled", foreground: "#fff", background: "#EF4444" },
              { text: "Archiwum", value: "archived", foreground: "#fff", background: "#1F2937" },
            ],
          },
          options: {
            choices: [
              { text: "Przyjęty", value: "received" },
              { text: "Diagnoza", value: "diagnosing" },
              { text: "Wycena u klienta", value: "awaiting_quote" },
              { text: "Oczekiwanie na części", value: "awaiting_parts" },
              { text: "Naprawa", value: "repairing" },
              { text: "Kontrola jakości", value: "testing" },
              { text: "Gotowy do odbioru", value: "ready" },
              { text: "Wydany", value: "delivered" },
              { text: "Wstrzymany", value: "on_hold" },
              { text: "Klient odmówił wyceny", value: "rejected_by_customer" },
              { text: "Zwrócony bez naprawy", value: "returned_no_repair" },
              { text: "Zamknięty", value: "closed" },
              { text: "Anulowany", value: "cancelled" },
              { text: "Archiwum", value: "archived" },
            ],
          },
        },
      },
      {
        field: "location",
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          width: "half",
          options: { template: "{{name}} ({{warehouse_code}})" },
          special: ["m2o"],
          note: "Punkt sprzedaży, w którym przyjęto urządzenie.",
        },
      },
      {
        field: "service_location",
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          width: "half",
          options: { template: "{{name}} ({{warehouse_code}})" },
          special: ["m2o"],
          note: "Docelowy punkt serwisowy (jeśli inny niż punkt przyjęcia).",
        },
      },
      {
        field: "type",
        type: "string",
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Telefon", value: "phone" },
              { text: "Tablet", value: "tablet" },
              { text: "Laptop", value: "laptop" },
              { text: "Smartwatch", value: "smartwatch" },
              { text: "Słuchawki", value: "headphones" },
              { text: "Inne", value: "other" },
            ],
            allowOther: true,
          },
        },
      },
      { field: "brand", type: "string", meta: { interface: "input", width: "half" } },
      { field: "model", type: "string", meta: { interface: "input", width: "half" } },
      {
        field: "imei",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "qr_code", font: "monospace" },
          note: "IMEI 15 cyfr (telefony) lub serial number.",
        },
      },
      { field: "color", type: "string", meta: { interface: "input", width: "half" } },
      {
        field: "lock_type",
        type: "string",
        schema: { default_value: "none" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Brak blokady", value: "none" },
              { text: "PIN", value: "pin" },
              { text: "Wzór", value: "pattern" },
              { text: "Hasło", value: "password" },
              { text: "Face ID", value: "face" },
              { text: "Odcisk palca", value: "fingerprint" },
              { text: "Kombinowana", value: "multi" },
            ],
          },
        },
      },
      {
        field: "lock_code",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "lock", masked: true },
          note: "Kod / wzór blokady (PIN, wzór, hasło). Trzymane bezpiecznie — pole readable tylko dla serwisantów.",
        },
      },
      {
        field: "signed_in_account",
        type: "string",
        meta: {
          interface: "input",
          width: "full",
          options: { iconLeft: "account_circle", placeholder: "np. iCloud apple@... lub Google account" },
          note: "Konto na które urządzenie jest zalogowane (apple ID, google account itp.) — kluczowe dla diagnozy.",
        },
      },
      {
        field: "accessories",
        type: "json",
        meta: {
          interface: "tags",
          width: "full",
          options: {
            placeholder: "kabel, ładowarka, etui, słuchawki, sim_tray, pudełko, instrukcja",
            presets: [
              "kabel",
              "ładowarka",
              "etui",
              "szkło",
              "słuchawki",
              "pudełko",
              "instrukcja",
              "tacka_sim",
              "rysik",
            ],
          },
          note: "Akcesoria dostarczone razem z urządzeniem (do zwrotu).",
        },
      },
      {
        field: "intake_checklist",
        type: "json",
        meta: {
          interface: "input-code",
          width: "full",
          options: { language: "JSON" },
          note: "Checklista przyjęcia. JSON: {powers_on (yes/no/vibrates), bent (boolean), cracked_front (boolean), cracked_back (boolean), face_touch_id (boolean), water_damage (yes/no/unknown), notes}.",
        },
      },
      {
        field: "charging_current",
        type: "decimal",
        schema: { numeric_precision: 5, numeric_scale: 2 },
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "bolt" },
          note: "Prąd ładowania w amperach (X.XX A). Pomijane gdy water_damage = yes/unknown.",
        },
      },
      {
        field: "visual_condition",
        type: "json",
        meta: {
          interface: "input-code",
          width: "full",
          options: { language: "JSON" },
          note: "Stan wizualny urządzenia (z 3D walkthrough): { display_rating (1-10), display_notes, back_notes, camera_notes, frames_notes, earpiece_clean (boolean), speakers_clean (boolean), port_clean (boolean), additional_notes }.",
        },
      },
      {
        field: "description",
        type: "text",
        meta: {
          interface: "input-multiline",
          width: "full",
          options: { placeholder: "Opis usterki podany przez klienta" },
        },
      },
      {
        field: "diagnosis",
        type: "text",
        meta: {
          interface: "input-multiline",
          width: "full",
          options: { placeholder: "Diagnoza technika" },
        },
      },
      {
        field: "amount_estimate",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2 },
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "payments" },
          note: "Wycena wstępna (PLN).",
        },
      },
      {
        field: "amount_final",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2 },
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "payments" },
          note: "Kwota końcowa (PLN).",
        },
      },
      { field: "contact_phone", type: "string", meta: { interface: "input", width: "half", options: { iconLeft: "phone" } } },
      { field: "contact_email", type: "string", meta: { interface: "input", width: "half", options: { iconLeft: "mail" } } },
      { field: "customer_first_name", type: "string", meta: { interface: "input", width: "half" } },
      { field: "customer_last_name", type: "string", meta: { interface: "input", width: "half" } },
      {
        field: "photos",
        type: "json",
        meta: {
          interface: "list",
          width: "full",
          note: "URL-e zdjęć urządzenia (proxy /api/public/photos/{id}).",
        },
      },
      {
        field: "received_by",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "person", font: "monospace" },
          note: "Email pracownika który przyjął zlecenie (z Keycloak).",
        },
      },
      {
        field: "assigned_technician",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "engineering", font: "monospace" },
          note: "Email serwisanta przypisanego do zlecenia.",
        },
      },
      {
        field: "transport_status",
        type: "string",
        schema: { default_value: "none" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          display: "labels",
          options: {
            choices: [
              { text: "Brak transportu", value: "none" },
              { text: "Do odbioru", value: "pickup_pending" },
              { text: "W drodze do serwisu", value: "in_transit_to_service" },
              { text: "Dostarczony do serwisu", value: "delivered_to_service" },
              { text: "Do zwrotu klientowi", value: "return_pending" },
              { text: "W drodze do klienta", value: "in_transit_to_customer" },
              { text: "Dostarczony klientowi", value: "delivered_to_customer" },
            ],
          },
        },
      },
      {
        field: "chatwoot_conversation_id",
        type: "integer",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "chat", font: "monospace" },
          note: "ID rozmowy Chatwoot — auto-link do supportu klienta.",
        },
      },
      {
        field: "warranty_until",
        type: "date",
        meta: {
          interface: "datetime",
          width: "half",
          options: { iconLeft: "verified" },
          note: "Data końca gwarancji (jeśli serwis gwarancyjny).",
        },
      },
      {
        field: "promised_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          width: "half",
          options: { iconLeft: "schedule" },
          note: "Obiecany termin gotowości.",
        },
      },
      {
        field: "previous_status",
        type: "string",
        schema: { is_nullable: true },
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          note: "Poprzedni status — auto-zapisywany przy on_hold do resume.",
        },
      },
      {
        field: "hold_reason",
        type: "text",
        schema: { is_nullable: true },
        meta: {
          interface: "input-multiline",
          width: "full",
          note: "Powód wstrzymania zlecenia (on_hold).",
        },
      },
      {
        field: "cancellation_reason",
        type: "text",
        schema: { is_nullable: true },
        meta: {
          interface: "input-multiline",
          width: "full",
          note: "Powód anulowania / zwrotu bez naprawy.",
        },
      },
      {
        field: "created_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
      },
      {
        field: "updated_at",
        type: "timestamp",
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          display: "datetime",
          display_options: { relative: true },
        },
      },
    ],
  },

  // === Reklamacje ===
  {
    collection: "mp_claims",
    meta: {
      icon: "report_problem",
      note: "Reklamacje klientów — produkt + paragon + opis usterki + żądanie. Powiązane z mp_locations (gdzie zgłoszono).",
      display_template: "{{customer_last_name}}, {{product_name}} — {{status}}",
      sort_field: "-created_at",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "claim_number",
        type: "string",
        schema: { is_nullable: false, is_unique: true },
        meta: {
          interface: "input",
          required: true,
          readonly: true,
          width: "half",
          options: { iconLeft: "tag", font: "monospace" },
        },
      },
      {
        field: "status",
        type: "string",
        schema: { default_value: "new" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          display: "labels",
          options: {
            choices: [
              { text: "Nowa", value: "new" },
              { text: "W rozpatrywaniu", value: "review" },
              { text: "Zaakceptowana", value: "accepted" },
              { text: "Odrzucona", value: "rejected" },
              { text: "Zakończona", value: "closed" },
            ],
          },
        },
      },
      {
        field: "location",
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          width: "full",
          options: { template: "{{name}} ({{warehouse_code}})" },
          special: ["m2o"],
        },
      },
      { field: "customer_first_name", type: "string", meta: { interface: "input", width: "half" } },
      { field: "customer_last_name", type: "string", meta: { interface: "input", width: "half" } },
      { field: "phone", type: "string", meta: { interface: "input", width: "half", options: { iconLeft: "phone" } } },
      { field: "email", type: "string", meta: { interface: "input", width: "half", options: { iconLeft: "mail" } } },
      { field: "product_name", type: "string", meta: { interface: "input", width: "full" } },
      { field: "purchase_date", type: "date", meta: { interface: "datetime", width: "half" } },
      { field: "receipt_number", type: "string", meta: { interface: "input", width: "half", options: { font: "monospace" } } },
      {
        field: "product_value",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2 },
        meta: { interface: "input", width: "half", options: { iconLeft: "payments" } },
      },
      {
        field: "defect_description",
        type: "text",
        meta: { interface: "input-multiline", width: "full" },
      },
      {
        field: "customer_demand",
        type: "string",
        meta: {
          interface: "select-dropdown",
          width: "full",
          options: {
            choices: [
              { text: "Naprawa", value: "repair" },
              { text: "Wymiana", value: "exchange" },
              { text: "Zwrot pieniędzy", value: "refund" },
              { text: "Obniżenie ceny", value: "discount" },
            ],
            allowOther: true,
          },
        },
      },
      { field: "received_by", type: "string", meta: { interface: "input", width: "full", options: { iconLeft: "person" } } },
      {
        field: "photos",
        type: "json",
        meta: { interface: "list", width: "full" },
      },
      {
        field: "created_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, width: "half", display: "datetime", display_options: { relative: true } },
      },
      {
        field: "updated_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, width: "half", display: "datetime", display_options: { relative: true } },
      },
    ],
  },

  // === Pakiet ochronny ===
  {
    collection: "mp_protections",
    meta: {
      icon: "shield",
      note: "Pakiety ochronne (szkło hartowane, gwarancja rozszerzona) sprzedane do urządzeń. Powiązane z punktem sprzedaży.",
      display_template: "{{brand}} {{model}} ({{imei}})",
      sort_field: "-created_at",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "location",
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          width: "full",
          options: { template: "{{name}} ({{warehouse_code}})" },
          special: ["m2o"],
        },
      },
      { field: "brand", type: "string", meta: { interface: "input", width: "half" } },
      { field: "model", type: "string", meta: { interface: "input", width: "half" } },
      {
        field: "imei",
        type: "string",
        meta: { interface: "input", width: "half", options: { font: "monospace" } },
      },
      {
        field: "glass_type",
        type: "string",
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Bez szkła", value: "none" },
              { text: "Standard 2.5D", value: "standard" },
              { text: "Szkło UV", value: "uv" },
              { text: "Szkło prywatyzujące", value: "privacy" },
              { text: "Szkło 3D pełne", value: "full_3d" },
            ],
            allowOther: true,
          },
        },
      },
      {
        field: "extended_warranty",
        type: "boolean",
        schema: { default_value: false },
        meta: { interface: "boolean", width: "half", options: { label: "Gwarancja rozszerzona" } },
      },
      {
        field: "warranty_months",
        type: "integer",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "schedule", min: 0, max: 60 },
          note: "Długość gwarancji rozszerzonej (miesiące).",
        },
      },
      {
        field: "amount",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2 },
        meta: { interface: "input", width: "half", options: { iconLeft: "payments" } },
      },
      { field: "customer_first_name", type: "string", meta: { interface: "input", width: "half" } },
      { field: "customer_last_name", type: "string", meta: { interface: "input", width: "half" } },
      { field: "phone", type: "string", meta: { interface: "input", width: "half", options: { iconLeft: "phone" } } },
      { field: "email", type: "string", meta: { interface: "input", width: "half", options: { iconLeft: "mail" } } },
      { field: "sold_by", type: "string", meta: { interface: "input", width: "full", options: { iconLeft: "person" } } },
      {
        field: "created_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, width: "half", display: "datetime", display_options: { relative: true } },
      },
      {
        field: "updated_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, width: "half", display: "datetime", display_options: { relative: true } },
      },
    ],
  },
];
