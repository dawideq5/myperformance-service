import type { CollectionSpec } from "../types";

/**
 * Pozostałe collections modułu serwisowego: typy napraw, cennik, historia
 * edycji (revisions), podpisy pracowników, action log, transport (panel
 * kierowcy).
 */

export const SERVICES_EXTRAS_SPECS: CollectionSpec[] = [
  // === Typy napraw (skalowalna definicja katalogu usług) ===
  // Każda pozycja to rodzaj naprawy (np. "Wymiana wyświetlacza") z:
  // - default_warranty_months: gwarancja (null = brak)
  // - time_min/max + time_unit: zakres czasu naprawy
  // - combinable_mode + combinable_with: kogo można łączyć z tą naprawą
  // - sums_mode + sums_with: czy łączenie sumuje cenę (alternatywa: "skontaktuj się z serwisantem")
  // - icon: nazwa lucide (np. "Battery", "Wrench")
  // mp_pricelist linkuje przez `repair_type_code` (string FK).
  {
    collection: "mp_repair_types",
    meta: {
      icon: "build",
      note: "Katalog rodzajów napraw — etykiety, ikony, gwarancja, czas, reguły łączenia z innymi naprawami.",
      display_template: "{{label}} ({{code}})",
      sort_field: "sort_order",
      archive_field: "is_active",
      archive_value: "false",
      unarchive_value: "true",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "code",
        type: "string",
        schema: { is_nullable: false, is_unique: true },
        meta: {
          interface: "input",
          required: true,
          width: "half",
          options: { iconLeft: "tag", font: "monospace" },
          note: "Stabilny identyfikator (np. SCREEN_REPLACEMENT). A-Z 0-9 _",
        },
      },
      { field: "label", type: "string", schema: { is_nullable: false }, meta: { interface: "input", required: true, width: "half", note: "Polska etykieta widoczna w UI." } },
      // Kategoria UI — używana do grupowania w cenniku/pickerze. Dowolny string
      // (allowOther), kategorie mp_pricelist są pochodną unikalnych wartości tego
      // pola. Bez hardcoded enum.
      {
        field: "category",
        type: "string",
        schema: { default_value: "Inne" },
        meta: {
          interface: "input",
          width: "half",
          note: "Kategoria do grupowania (np. Wyświetlacze, Baterie, Czyszczenie). Dowolna nazwa.",
        },
      },
      { field: "icon", type: "string", schema: { default_value: "Wrench" }, meta: { interface: "input", width: "half", note: "Nazwa ikony lucide (Battery, Camera, Wrench...)." } },
      { field: "color", type: "string", schema: { default_value: "#3b82f6" }, meta: { interface: "select-color", width: "half" } },
      { field: "description", type: "text", meta: { interface: "input-multiline", width: "full", note: "Opis dla pracownika (kiedy używać)." } },
      // Gwarancja (per typ naprawy — nadrzędne nad mp_pricelist).
      { field: "default_warranty_months", type: "integer", schema: { is_nullable: true }, meta: { interface: "input", width: "third", note: "Domyślna gwarancja w miesiącach. Puste = brak gwarancji." } },
      // Czas naprawy.
      { field: "time_min", type: "integer", schema: { is_nullable: true }, meta: { interface: "input", width: "third", note: "Min czas (w wybranej jednostce)." } },
      { field: "time_max", type: "integer", schema: { is_nullable: true }, meta: { interface: "input", width: "third", note: "Max czas." } },
      {
        field: "time_unit",
        type: "string",
        schema: { default_value: "minutes" },
        meta: {
          interface: "select-dropdown",
          width: "third",
          options: {
            choices: [
              { text: "minuty", value: "minutes" },
              { text: "godziny", value: "hours" },
              { text: "dni", value: "days" },
            ],
          },
        },
      },
      // Reguły łączenia.
      {
        field: "combinable_mode",
        type: "string",
        schema: { default_value: "yes" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Tak — łącz z każdym", value: "yes" },
              { text: "Nie — naprawa wyłączna", value: "no" },
              { text: "Tylko z wybranymi", value: "only_with" },
              { text: "Z każdym z wyjątkiem", value: "except" },
            ],
          },
          note: "Czy ta naprawa może być łączona z innymi w jednym zleceniu.",
        },
      },
      { field: "combinable_with", type: "json", schema: { default_value: "[]" }, meta: { interface: "list", width: "half", note: "Tablica kodów napraw (relevant gdy only_with/except)." } },
      // Reguły sumowania ceny.
      {
        field: "sums_mode",
        type: "string",
        schema: { default_value: "yes" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Tak — sumuj cenę", value: "yes" },
              { text: "Nie — kontakt z serwisantem", value: "no" },
              { text: "Tylko z wybranymi", value: "only_with" },
              { text: "Z każdym z wyjątkiem", value: "except" },
            ],
          },
          note: "Czy łączenie z innymi sumuje cenę (no = wymagany kontakt z serwisantem).",
        },
      },
      { field: "sums_with", type: "json", schema: { default_value: "[]" }, meta: { interface: "list", width: "half", note: "Tablica kodów (relevant gdy only_with/except)." } },
      // Meta.
      { field: "is_active", type: "boolean", schema: { default_value: true }, meta: { interface: "boolean", width: "half" } },
      { field: "sort_order", type: "integer", schema: { default_value: 0 }, meta: { interface: "input", width: "half" } },
    ],
  },

  // === Cennik ===
  // Pozycje cennika edytowane przez admin /admin/config (read-only w panelach).
  {
    collection: "mp_pricelist",
    meta: {
      icon: "sell",
      note: "Cennik usług serwisowych i pakietów. Pozycje grupowane po category. Edytowany przez admina.",
      display_template: "{{name}} ({{category}}) — {{price}} PLN",
      sort_field: "sort",
      archive_field: "enabled",
      archive_value: "false",
      unarchive_value: "true",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "code",
        type: "string",
        schema: { is_nullable: false, is_unique: true },
        meta: {
          interface: "input",
          required: true,
          width: "half",
          options: { iconLeft: "tag", font: "monospace" },
          note: "Krótki kod pozycji (np. ECR_IPH_15).",
        },
      },
      { field: "name", type: "string", schema: { is_nullable: false }, meta: { interface: "input", required: true, width: "half" } },
      // Kategoria — opcjonalna, fallback gdy brak repair_type. Domyślnie
      // dziedziczona z mp_repair_types[code === pricelist.code].category przez
      // UI cennika (categoryFromRepairType). Dowolny string — bez hardcoded
      // enum.
      {
        field: "category",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          note: "Pozostawione dla pozycji bez powiązanego repair_type. Inaczej dziedziczone z mp_repair_types.category.",
        },
      },
      {
        field: "price",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2, is_nullable: false },
        meta: { interface: "input", required: true, width: "half", options: { iconLeft: "payments" } },
      },
      { field: "description", type: "text", meta: { interface: "input-multiline", width: "full" } },
      { field: "warranty_months", type: "integer", meta: { interface: "input", width: "half" } },
      { field: "duration_minutes", type: "integer", meta: { interface: "input", width: "half", note: "Szacowany czas wykonania (min)." } },
      { field: "sort", type: "integer", schema: { default_value: 0 }, meta: { interface: "input", width: "half" } },
      { field: "enabled", type: "boolean", schema: { default_value: true }, meta: { interface: "boolean", width: "half", options: { label: "Pozycja aktywna" } } },
      // Brand/model targeting — pozycja stosowana tylko gdy device match.
      // null = pasuje do wszystkich (default).
      { field: "brand", type: "string", schema: { is_nullable: true }, meta: { interface: "input", width: "half", note: "Marka urządzenia (Apple, Samsung, ...). Puste = wszystkie." } },
      { field: "model_pattern", type: "string", schema: { is_nullable: true }, meta: { interface: "input", width: "half", note: "Substring nazwy modelu (np. 'iPhone 12'). Puste = wszystkie modele tej marki." } },
    ],
  },

  // === Historia edycji serwisu ===
  // Każda zmiana w mp_services rejestrowana jako revision row. Pozwala
  // na audit (kto, co, kiedy zmienił) + generację aneksu gdy zmiana
  // dotyczy istotnych pól (cena, opis, zakres usług). Brak FK do
  // mp_services (Directus REST nie wspiera ON DELETE CASCADE z UI),
  // service_id trzymane jako uuid + handler purge przy delete service.
  {
    collection: "mp_service_revisions",
    meta: {
      icon: "history",
      note: "Historia edycji zleceń serwisowych — kto, kiedy i jakie pola zmienił. Tylko-do-odczytu.",
      display_template: "{{ticket_number}} — {{edited_by_name}} ({{created_at}})",
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
        field: "service_id",
        type: "uuid",
        schema: { is_nullable: false },
        meta: { interface: "input", readonly: true, width: "half", note: "ID zlecenia serwisowego (mp_services.id)." },
      },
      {
        field: "ticket_number",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half", options: { font: "monospace" } },
      },
      {
        field: "edited_by_email",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "edited_by_name",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "change_kind",
        type: "string",
        schema: { default_value: "edit" },
        meta: {
          interface: "select-dropdown",
          readonly: true,
          width: "half",
          options: {
            choices: [
              { text: "Edycja", value: "edit" },
              { text: "Zmiana statusu", value: "status_change" },
              { text: "Aneks wystawiony", value: "annex_issued" },
              { text: "Documenso", value: "documenso" },
            ],
          },
        },
      },
      {
        field: "is_significant",
        type: "boolean",
        schema: { default_value: false },
        meta: { interface: "boolean", readonly: true, width: "half", note: "Wymaga aneksu (zmiana ceny/opisu/zakresu)." },
      },
      {
        field: "summary",
        type: "text",
        meta: { interface: "input-multiline", readonly: true, width: "full", note: "Czytelny opis zmian (po polsku)." },
      },
      {
        field: "changes",
        type: "json",
        meta: { interface: "input-code", readonly: true, width: "full", options: { language: "json" }, note: "Diff JSON {field: {before, after}}." },
      },
      {
        field: "created_at",
        type: "timestamp",
        schema: { default_value: "now()" },
        meta: { interface: "datetime", readonly: true, width: "half", special: ["date-created"] },
      },
    ],
  },

  // === Podpisy pracowników (per-user, embed w PDF) ===
  // Każdy sprzedawca konfiguruje swój podpis raz w panelu (rysowany lub
  // tekstowy) i jest on automatycznie embedowany we wszystkie generowane
  // PDF potwierdzeń. Klient podpisuje swój przez Documenso.
  {
    collection: "mp_user_signatures",
    meta: {
      icon: "draw",
      note: "Podpisy pracowników — embed w PDF potwierdzeń. 1 rekord per email.",
      display_template: "{{user_email}} — {{signed_name}}",
      sort_field: "-updated_at",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "user_email",
        type: "string",
        schema: { is_nullable: false, is_unique: true },
        meta: { interface: "input", required: true, width: "half" },
      },
      {
        field: "signed_name",
        type: "string",
        meta: { interface: "input", width: "half", note: "Imię i nazwisko widoczne pod podpisem" },
      },
      {
        field: "png_data_url",
        type: "text",
        schema: { is_nullable: false },
        meta: { interface: "input-multiline", required: true, hidden: true, note: "Base64 PNG — embed w PDF" },
      },
      {
        field: "updated_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, width: "half", special: ["date-updated"] },
      },
    ],
  },

  // === Action log — akcje na serwisach ===
  // Każda akcja na zleceniu (podpis, wysyłka, druk, ponowna wysyłka) loguje
  // wpis tutaj. Pozwala na pełen audit trail w widoku /serwis/[id] —
  // niezależnie od mp_service_revisions które trzyma diff edycji pól.
  {
    collection: "mp_service_actions",
    meta: {
      icon: "fact_check",
      note: "Audit log akcji na zleceniach serwisowych (podpis, wysyłka, druk).",
      display_template: "{{action}} — {{ticket_number}} ({{created_at}})",
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
        field: "service_id",
        type: "uuid",
        schema: { is_nullable: false },
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "ticket_number",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half", options: { font: "monospace" } },
      },
      {
        field: "action",
        type: "string",
        schema: { is_nullable: false },
        meta: {
          interface: "select-dropdown",
          readonly: true,
          width: "half",
          options: {
            choices: [
              { text: "Podpis pracownika", value: "employee_sign" },
              { text: "Wydruk PDF", value: "print" },
              { text: "Wysłano e-potwierdzenie", value: "send_electronic" },
              { text: "Ponowne wysłanie", value: "resend_electronic" },
              { text: "Klient podpisał", value: "client_signed" },
              { text: "Klient odrzucił", value: "client_rejected" },
              { text: "Aneks wystawiony", value: "annex_issued" },
              { text: "Zmiana statusu", value: "status_change" },
              { text: "Zmiana wyceny", value: "quote_changed" },
              { text: "Aneks utworzony", value: "annex_created" },
              { text: "Aneks zaakceptowany", value: "annex_accepted" },
              { text: "Aneks odrzucony", value: "annex_rejected" },
              { text: "Zdjęcie dodane", value: "photo_uploaded" },
              { text: "Zdjęcie usunięte", value: "photo_deleted" },
              { text: "Notatka dodana", value: "note_added" },
              { text: "Notatka usunięta", value: "note_deleted" },
              { text: "Transport zamówiony", value: "transport_requested" },
              { text: "Inne", value: "other" },
            ],
          },
        },
      },
      {
        field: "actor_email",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "actor_name",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "summary",
        type: "text",
        meta: { interface: "input-multiline", readonly: true, width: "full" },
      },
      {
        field: "payload",
        type: "json",
        meta: { interface: "input-code", readonly: true, width: "full", options: { language: "json" } },
      },
      {
        field: "created_at",
        type: "timestamp",
        schema: { default_value: "now()" },
        meta: { interface: "datetime", readonly: true, width: "half", special: ["date-created"] },
      },
    ],
  },

  // === Transport / dostawa (panel kierowcy) ===
  // Każde zlecenie transportu ma source + destination location, status, kierowcę,
  // ETA, podpis odbioru. Powiązany m2o z mp_services (które urządzenie wozimy).
  {
    collection: "mp_transport_jobs",
    meta: {
      icon: "local_shipping",
      note: "Zlecenia transportowe między punktami (odbiór do serwisu, zwrot do klienta). Panel kierowcy zarządza tymi zleceniami.",
      display_template: "{{job_number}} — {{status}}",
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
        field: "job_number",
        type: "string",
        schema: { is_nullable: false, is_unique: true },
        meta: { interface: "input", required: true, readonly: true, width: "half", options: { font: "monospace" } },
      },
      {
        field: "status",
        type: "string",
        schema: { default_value: "queued" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          display: "labels",
          options: {
            choices: [
              { text: "W kolejce", value: "queued" },
              { text: "Przypisany kierowca", value: "assigned" },
              { text: "W drodze", value: "in_transit" },
              { text: "Dostarczony", value: "delivered" },
              { text: "Anulowany", value: "cancelled" },
            ],
          },
        },
      },
      {
        field: "kind",
        type: "string",
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Odbiór do serwisu", value: "pickup_to_service" },
              { text: "Zwrot do klienta", value: "return_to_customer" },
              { text: "Między magazynami", value: "warehouse_transfer" },
            ],
          },
        },
      },
      {
        field: "service",
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          width: "full",
          options: { template: "{{ticket_number}} — {{brand}} {{model}}" },
          special: ["m2o"],
          note: "Powiązany serwis (mp_services).",
        },
      },
      {
        field: "source_location",
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          width: "half",
          options: { template: "{{name}} ({{warehouse_code}})" },
          special: ["m2o"],
        },
      },
      {
        field: "destination_location",
        type: "uuid",
        meta: {
          interface: "select-dropdown-m2o",
          width: "half",
          options: { template: "{{name}} ({{warehouse_code}})" },
          special: ["m2o"],
        },
      },
      {
        field: "destination_address",
        type: "string",
        meta: {
          interface: "input",
          width: "full",
          options: { iconLeft: "place" },
          note: "Adres ad-hoc (gdy zwrot do klienta — bez naszego punktu).",
        },
      },
      { field: "destination_lat", type: "decimal", schema: { numeric_precision: 9, numeric_scale: 6 }, meta: { interface: "input", width: "half" } },
      { field: "destination_lng", type: "decimal", schema: { numeric_precision: 9, numeric_scale: 6 }, meta: { interface: "input", width: "half" } },
      { field: "assigned_driver", type: "string", meta: { interface: "input", width: "full", options: { iconLeft: "person", font: "monospace" }, note: "Email kierowcy (z Keycloak)." } },
      { field: "scheduled_at", type: "timestamp", meta: { interface: "datetime", width: "half" } },
      { field: "picked_up_at", type: "timestamp", meta: { interface: "datetime", width: "half", readonly: true } },
      { field: "delivered_at", type: "timestamp", meta: { interface: "datetime", width: "half", readonly: true } },
      { field: "recipient_signature", type: "text", meta: { interface: "input-multiline", width: "full", note: "Base64 podpisu odbioru." } },
      { field: "notes", type: "text", meta: { interface: "input-multiline", width: "full" } },
      { field: "created_at", type: "timestamp", meta: { interface: "datetime", readonly: true, width: "half", display: "datetime", display_options: { relative: true } } },
      { field: "updated_at", type: "timestamp", meta: { interface: "datetime", readonly: true, width: "half", display: "datetime", display_options: { relative: true } } },
    ],
  },

  // === Zdjęcia zlecenia (panel serwisanta — etapy intake/diagnosis/repair) ===
  // Każde zdjęcie powiązane ze service_id + stage. Soft-delete (deleted_at).
  // Storage: Directus Files (folder "service-photos") + opcjonalny MinIO ref.
  {
    collection: "mp_service_photos",
    meta: {
      icon: "photo_library",
      note: "Zdjęcia zleceń serwisowych — przyjęcie, diagnoza, naprawa, przed wydaniem.",
      display_template: "{{ticket_number}} — {{stage}} ({{uploaded_at}})",
      sort_field: "-uploaded_at",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "service_id",
        type: "uuid",
        schema: { is_nullable: false },
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "ticket_number",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half", options: { font: "monospace" } },
      },
      {
        field: "storage_kind",
        type: "string",
        schema: { default_value: "directus", is_nullable: false },
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Directus Files", value: "directus" },
              { text: "MinIO", value: "minio" },
            ],
          },
        },
      },
      {
        field: "storage_ref",
        type: "string",
        schema: { is_nullable: true },
        meta: {
          interface: "input",
          width: "half",
          options: { font: "monospace" },
          note: "ID pliku w Directus Files lub key MinIO.",
        },
      },
      {
        field: "url",
        type: "string",
        schema: { is_nullable: true },
        meta: {
          interface: "input",
          width: "full",
          options: { iconLeft: "link" },
          note: "Publiczny URL przez auth proxy /api/public/service-photos/{id}.",
        },
      },
      {
        field: "thumbnail_url",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", width: "full", note: "Opcjonalny thumbnail." },
      },
      {
        field: "stage",
        type: "string",
        schema: { default_value: "intake", is_nullable: false },
        meta: {
          interface: "select-dropdown",
          width: "half",
          display: "labels",
          options: {
            choices: [
              { text: "Przyjęcie", value: "intake" },
              { text: "Diagnoza", value: "diagnosis" },
              { text: "Naprawa", value: "in_repair" },
              { text: "Przed wydaniem", value: "before_delivery" },
              { text: "Inne", value: "other" },
            ],
          },
        },
      },
      {
        field: "note",
        type: "text",
        meta: { interface: "input-multiline", width: "full" },
      },
      {
        field: "uploaded_by",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half", options: { iconLeft: "person" } },
      },
      {
        field: "uploaded_at",
        type: "timestamp",
        schema: { default_value: "now()" },
        meta: { interface: "datetime", readonly: true, width: "half", special: ["date-created"] },
      },
      { field: "filename", type: "string", schema: { is_nullable: true }, meta: { interface: "input", readonly: true, width: "half" } },
      { field: "size_bytes", type: "bigInteger", schema: { is_nullable: true }, meta: { interface: "input", readonly: true, width: "half" } },
      { field: "content_type", type: "string", schema: { is_nullable: true }, meta: { interface: "input", readonly: true, width: "half" } },
      {
        field: "deleted_at",
        type: "timestamp",
        schema: { is_nullable: true },
        meta: { interface: "datetime", readonly: true, width: "half", note: "Soft delete — null = aktywne." },
      },
    ],
  },

  // === Historia zmian wyceny ===
  // Każda zmiana amount_estimate w mp_services rejestrowana tutaj. delta jest
  // GENERATED kolumną (Postgres), Directus traktuje ją jako zwykły numeric.
  // Powiązanie z annex_id pozwala odtworzyć kto/jak zaaprobował zmianę.
  {
    collection: "mp_service_quote_history",
    meta: {
      icon: "history_toggle_off",
      note: "Historia zmian wyceny serwisu — kto, kiedy, o ile zmienił kwotę i czy istnieje aneks.",
      display_template: "{{ticket_number}} — Δ {{delta}} PLN ({{changed_at}})",
      sort_field: "-changed_at",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "service_id",
        type: "uuid",
        schema: { is_nullable: false },
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "ticket_number",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half", options: { font: "monospace" } },
      },
      {
        field: "old_amount",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2, is_nullable: true },
        meta: { interface: "input", readonly: true, width: "third", options: { iconLeft: "payments" } },
      },
      {
        field: "new_amount",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2, is_nullable: true },
        meta: { interface: "input", readonly: true, width: "third", options: { iconLeft: "payments" } },
      },
      {
        field: "delta",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2, is_nullable: true },
        meta: {
          interface: "input",
          readonly: true,
          width: "third",
          options: { iconLeft: "trending_up" },
          note: "Wirtualna kolumna — wyliczana w app layer (new_amount - old_amount).",
        },
      },
      {
        field: "reason",
        type: "text",
        schema: { is_nullable: true },
        meta: { interface: "input-multiline", width: "full" },
      },
      {
        field: "items",
        type: "json",
        schema: { is_nullable: true },
        meta: {
          interface: "input-code",
          width: "full",
          options: { language: "json" },
          note: "Pozycje wyceny [{name, qty, price}].",
        },
      },
      {
        field: "annex_id",
        type: "uuid",
        schema: { is_nullable: true },
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          note: "ID aneksu który zatwierdził zmianę (mp_service_annexes.id).",
        },
      },
      {
        field: "changed_by_email",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "changed_by_name",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "changed_at",
        type: "timestamp",
        schema: { default_value: "now()" },
        meta: { interface: "datetime", readonly: true, width: "half", special: ["date-created"] },
      },
    ],
  },

  // === Aneksy do zlecenia (zmiana ceny / zakresu) ===
  // Aneks dokumentuje istotną zmianę warunków po wystawieniu pierwotnego
  // potwierdzenia. Akceptacja: Documenso (e-podpis), telefon (manual)
  // lub email (manual po linku z Postal/Chatwoot).
  {
    collection: "mp_service_annexes",
    meta: {
      icon: "post_add",
      note: "Aneksy do zleceń serwisowych — zmiany ceny / zakresu wymagające akceptacji klienta.",
      display_template: "{{ticket_number}} — Δ {{delta_amount}} PLN ({{acceptance_status}})",
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
        field: "service_id",
        type: "uuid",
        schema: { is_nullable: false },
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "ticket_number",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half", options: { font: "monospace" } },
      },
      {
        field: "delta_amount",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2, is_nullable: false },
        meta: { interface: "input", required: true, width: "half", options: { iconLeft: "payments" } },
      },
      {
        field: "reason",
        type: "text",
        schema: { is_nullable: false },
        meta: { interface: "input-multiline", required: true, width: "full" },
      },
      {
        field: "acceptance_method",
        type: "string",
        schema: { is_nullable: false },
        meta: {
          interface: "select-dropdown",
          required: true,
          width: "half",
          options: {
            choices: [
              { text: "Documenso (e-podpis)", value: "documenso" },
              { text: "Telefon", value: "phone" },
              { text: "Email", value: "email" },
            ],
          },
        },
      },
      {
        field: "acceptance_status",
        type: "string",
        schema: { default_value: "pending", is_nullable: false },
        meta: {
          interface: "select-dropdown",
          width: "half",
          display: "labels",
          options: {
            choices: [
              { text: "Oczekuje", value: "pending" },
              { text: "Zaakceptowany", value: "accepted" },
              { text: "Odrzucony", value: "rejected" },
              { text: "Wygasł", value: "expired" },
            ],
          },
        },
      },
      {
        field: "documenso_doc_id",
        type: "bigInteger",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "documenso_signing_url",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "full" },
      },
      {
        field: "customer_name",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", width: "half" },
      },
      {
        field: "message_id",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", width: "half", options: { font: "monospace" }, note: "ID wiadomości email/telefon (audit)." },
      },
      {
        field: "conversation_id",
        type: "integer",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "half", options: { iconLeft: "chat" } },
      },
      {
        field: "note",
        type: "text",
        schema: { is_nullable: true },
        meta: { interface: "input-multiline", width: "full" },
      },
      {
        field: "pdf_hash",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "full", options: { font: "monospace" }, note: "SHA-256 wygenerowanego PDF aneksu." },
      },
      {
        field: "created_by_email",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "created_by_name",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "created_at",
        type: "timestamp",
        schema: { default_value: "now()" },
        meta: { interface: "datetime", readonly: true, width: "half", special: ["date-created"] },
      },
      {
        field: "accepted_at",
        type: "timestamp",
        schema: { is_nullable: true },
        meta: { interface: "datetime", readonly: true, width: "half" },
      },
      {
        field: "rejected_at",
        type: "timestamp",
        schema: { is_nullable: true },
        meta: { interface: "datetime", readonly: true, width: "half" },
      },
    ],
  },

  // === Notatki wewnętrzne (Wave 19/Phase 1D) ===
  // Komunikacja serwisant↔sprzedawca per zlecenie (NIE widoczne dla klienta).
  // visibility=team → widzą wszyscy z dostępem; service_only → tylko serwis.
  // pinned=true → wyświetlane na górze listy. Soft-delete (deleted_at).
  // Bez FK do mp_services (Directus REST nie wspiera CASCADE z UI), purge
  // ręczny przy delete service.
  {
    collection: "mp_service_internal_notes",
    meta: {
      icon: "sticky_note_2",
      note: "Notatki wewnętrzne pracowników na zleceniu serwisowym (nie widoczne dla klienta).",
      display_template: "{{ticket_number}} — {{author_name}} ({{created_at}})",
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
        field: "service_id",
        type: "uuid",
        schema: { is_nullable: false },
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "ticket_number",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half", options: { font: "monospace" } },
      },
      {
        field: "body",
        type: "text",
        schema: { is_nullable: false },
        meta: { interface: "input-multiline", required: true, width: "full" },
      },
      {
        field: "author_email",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "author_name",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "author_role",
        type: "string",
        schema: { default_value: "service" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Serwis", value: "service" },
              { text: "Sprzedaż", value: "sales" },
              { text: "Kierowca", value: "driver" },
              { text: "Inne", value: "other" },
            ],
          },
        },
      },
      {
        field: "visibility",
        type: "string",
        schema: { default_value: "team", is_nullable: false },
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Cały zespół", value: "team" },
              { text: "Tylko serwis", value: "service_only" },
            ],
          },
        },
      },
      {
        field: "pinned",
        type: "boolean",
        schema: { default_value: false },
        meta: { interface: "boolean", width: "half" },
      },
      {
        field: "created_at",
        type: "timestamp",
        schema: { default_value: "now()" },
        meta: { interface: "datetime", readonly: true, width: "half", special: ["date-created"] },
      },
      {
        field: "deleted_at",
        type: "timestamp",
        schema: { is_nullable: true },
        meta: { interface: "datetime", readonly: true, width: "half", note: "Soft delete — null = aktywne." },
      },
    ],
  },
];

