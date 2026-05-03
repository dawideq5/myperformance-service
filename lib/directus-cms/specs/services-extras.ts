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
    group: "mp_folder_business",
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
    group: "mp_folder_business",
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
    group: "mp_folder_serwis",
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
    group: "mp_folder_system",
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
    group: "mp_folder_system",
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
              { text: "Kod wydania wygenerowany", value: "release_code_generated" },
              { text: "Kod wydania wysłany", value: "release_code_sent" },
              { text: "Kod wydania ponownie wysłany", value: "release_code_resent" },
              { text: "Wysyłka kodu wydania nieudana", value: "release_code_failed" },
              { text: "Wydanie urządzenia", value: "release_completed" },
              { text: "Notatka o kontakcie z klientem", value: "customer_contact_recorded" },
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
    group: "mp_folder_serwis",
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
      {
        field: "reason",
        type: "string",
        meta: {
          interface: "input",
          width: "full",
          note: "Powód transportu — np. 'Brak narzędzi do wymiany płyty głównej'.",
        },
      },
      {
        field: "tracking_link",
        type: "string",
        meta: {
          interface: "input",
          width: "full",
          options: { iconLeft: "link" },
          note: "Link do śledzenia (Google Maps / kurier) — kierowca uzupełnia po przyjęciu.",
        },
      },
      {
        field: "created_by_email",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { iconLeft: "person", font: "monospace" },
          note: "Email serwisanta który utworzył zlecenie.",
        },
      },
      {
        field: "cancelled_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, width: "half" },
      },
      { field: "created_at", type: "timestamp", meta: { interface: "datetime", readonly: true, width: "half", display: "datetime", display_options: { relative: true } } },
      { field: "updated_at", type: "timestamp", meta: { interface: "datetime", readonly: true, width: "half", display: "datetime", display_options: { relative: true } } },
    ],
  },

  // === Zamówione części (panel serwisanta — gdy zlecenie awaiting_parts) ===
  // Lista zamówionych części od dostawców z trackingiem przesyłki. Service
  // może mieć multiple part_orders. Soft delete (deleted_at).
  {
    collection: "mp_service_part_orders",
    group: "mp_folder_serwis",
    meta: {
      icon: "inventory_2",
      note: "Zamówione części dla zleceń serwisowych w statusie 'awaiting_parts'. Każdy rekord = jedno zamówienie u dostawcy z trackingiem.",
      display_template: "{{ticket_number}} — {{part_name}} ({{status}})",
      sort_field: "-ordered_at",
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
        field: "part_name",
        type: "string",
        schema: { is_nullable: false },
        meta: { interface: "input", required: true, width: "full", note: "Np. 'Wyświetlacz iPhone 13 OEM'." },
      },
      {
        field: "supplier_name",
        type: "string",
        meta: { interface: "input", width: "half", options: { iconLeft: "store" }, note: "Nazwa hurtowni/dostawcy." },
      },
      {
        field: "courier",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "local_shipping" },
          note: "Np. DPD, InPost, Pocztex, GLS.",
        },
      },
      {
        field: "tracking_url",
        type: "string",
        meta: {
          interface: "input",
          width: "full",
          options: { iconLeft: "link" },
          note: "Pełen URL do śledzenia (np. https://tracktrace.dpd.com.pl/...).",
        },
      },
      {
        field: "tracking_number",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "tag", font: "monospace" },
          note: "Numer listu przewozowego.",
        },
      },
      {
        field: "expected_delivery_date",
        type: "date",
        meta: { interface: "datetime", width: "half" },
      },
      {
        field: "ordered_at",
        type: "timestamp",
        schema: { default_value: "now()", is_nullable: false },
        meta: { interface: "datetime", readonly: true, width: "half", display: "datetime", display_options: { relative: true } },
      },
      {
        field: "received_at",
        type: "timestamp",
        meta: { interface: "datetime", width: "half" },
      },
      {
        field: "status",
        type: "string",
        schema: { default_value: "ordered", is_nullable: false },
        meta: {
          interface: "select-dropdown",
          width: "half",
          display: "labels",
          options: {
            choices: [
              { text: "Zamówione", value: "ordered" },
              { text: "Wysłane", value: "shipped" },
              { text: "Dostarczone", value: "delivered" },
              { text: "Anulowane", value: "cancelled" },
              { text: "Zaginione", value: "lost" },
            ],
          },
        },
      },
      {
        field: "notes",
        type: "text",
        meta: { interface: "input-multiline", width: "full" },
      },
      {
        field: "created_by_email",
        type: "string",
        meta: {
          interface: "input",
          readonly: true,
          width: "full",
          options: { iconLeft: "person", font: "monospace" },
          note: "Email serwisanta który zamówił.",
        },
      },
      {
        field: "deleted_at",
        type: "timestamp",
        schema: { is_nullable: true },
        meta: { interface: "datetime", readonly: true, width: "half", note: "Soft delete — null = aktywne." },
      },
      {
        field: "created_at",
        type: "timestamp",
        schema: { default_value: "now()" },
        meta: { interface: "datetime", readonly: true, width: "half", special: ["date-created"] },
      },
      {
        field: "updated_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, width: "half", special: ["date-updated"] },
      },
    ],
  },

  // === Zdjęcia zlecenia (panel serwisanta — etapy intake/diagnosis/repair) ===
  // Każde zdjęcie powiązane ze service_id + stage. Soft-delete (deleted_at).
  // Storage: Directus Files (folder "service-photos") + opcjonalny MinIO ref.
  {
    collection: "mp_service_photos",
    group: "mp_folder_serwis",
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
    group: "mp_folder_serwis",
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
    group: "mp_folder_serwis",
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

  // === Komponenty użyte w naprawie (Wave 20/Phase 1E) ===
  // Każdy komponent (część zamienna / materiał) użyty w naprawie. Trzymamy
  // koszt netto, VAT, hurtownię, fakturę (numer + plik), daty zakupu/dostawy
  // — żeby liczyć marżę i mieć papier na zakup. cost_gross liczone w app
  // layer (Directus REST nie wspiera GENERATED ALWAYS AS w polu zwykłej
  // kolekcji; wzór z mp_service_quote_history.delta).
  // Soft delete (deleted_at). Bez FK do mp_services (Directus REST quirk).
  {
    collection: "mp_service_components",
    group: "mp_folder_serwis",
    meta: {
      icon: "memory",
      note: "Komponenty (części zamienne / materiały) użyte w naprawie — koszt, VAT, faktura, kalkulacja marży.",
      display_template: "{{ticket_number}} — {{name}} ({{cost_net}} PLN)",
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
        meta: { interface: "input", readonly: true, width: "half", note: "ID zlecenia (mp_services.id)." },
      },
      {
        field: "ticket_number",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "half", options: { font: "monospace" } },
      },
      {
        field: "name",
        type: "string",
        schema: { is_nullable: false },
        meta: {
          interface: "input",
          required: true,
          width: "full",
          note: "Nazwa komponentu (np. 'Wyświetlacz iPhone 13', 'Bateria Galaxy S22').",
        },
      },
      {
        field: "supplier_name",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", width: "half", note: "Hurtownia (np. 'GSM Hurt', 'MobileShop')." },
      },
      {
        field: "invoice_number",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", width: "half", options: { font: "monospace" }, note: "Numer faktury / paragonu (np. 'FV/2026/05/0042')." },
      },
      {
        field: "invoice_kind",
        type: "string",
        schema: { default_value: "faktura" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Faktura", value: "faktura" },
              { text: "Paragon", value: "paragon" },
              { text: "WZ", value: "wz" },
              { text: "Inny", value: "inny" },
            ],
          },
        },
      },
      {
        field: "purchase_date",
        type: "date",
        schema: { is_nullable: true },
        meta: { interface: "datetime", width: "half", note: "Data zakupu komponentu." },
      },
      {
        field: "delivery_date",
        type: "date",
        schema: { is_nullable: true },
        meta: { interface: "datetime", width: "half", note: "Data dostawy do serwisu." },
      },
      {
        field: "cost_net",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2, is_nullable: false, default_value: 0 },
        meta: {
          interface: "input",
          required: true,
          width: "third",
          options: { iconLeft: "payments" },
          note: "Cena netto za sztukę (PLN).",
        },
      },
      {
        field: "quantity",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 3, is_nullable: false, default_value: 1 },
        meta: {
          interface: "input",
          required: true,
          width: "third",
          note: "Ilość (np. 0.5 dla połowy zestawu).",
        },
      },
      {
        field: "vat_rate",
        type: "decimal",
        schema: { numeric_precision: 4, numeric_scale: 2, is_nullable: false, default_value: 23 },
        meta: {
          interface: "select-dropdown",
          width: "third",
          options: {
            choices: [
              { text: "0%", value: 0 },
              { text: "5%", value: 5 },
              { text: "8%", value: 8 },
              { text: "23%", value: 23 },
            ],
          },
          note: "Stawka VAT (PL: 0/5/8/23).",
        },
      },
      {
        field: "cost_gross",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 2, is_nullable: true },
        meta: {
          interface: "input",
          readonly: true,
          width: "third",
          options: { iconLeft: "receipt_long" },
          note: "Wirtualna kolumna — wyliczana w app layer (cost_net * quantity * (1 + vat_rate/100)).",
        },
      },
      {
        field: "margin_target_pct",
        type: "decimal",
        schema: { numeric_precision: 5, numeric_scale: 2, is_nullable: true },
        meta: { interface: "input", width: "third", note: "Docelowa marża %, opcjonalna." },
      },
      {
        field: "invoice_file_id",
        type: "string",
        schema: { is_nullable: true },
        meta: {
          interface: "input",
          width: "full",
          options: { font: "monospace" },
          note: "Directus file id (folder service-invoices) — skan/zdjęcie faktury.",
        },
      },
      {
        field: "notes",
        type: "text",
        schema: { is_nullable: true },
        meta: { interface: "input-multiline", width: "full" },
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
        field: "deleted_at",
        type: "timestamp",
        schema: { is_nullable: true },
        meta: { interface: "datetime", readonly: true, width: "half", note: "Soft delete — null = aktywne." },
      },
    ],
  },

  // === Biblioteka dokumentów per zlecenie (Wave 21 / Faza 1B) ===
  // Każdy dokument PDF wystawiony w cyklu życia zlecenia (potwierdzenie
  // przyjęcia, aneks, protokół wydania, kod wydania, gwarancja...) ma
  // tutaj swój wpis. Trzymamy 2 wersje: oryginał (wygenerowany lokalnie
  // przez nasze PDF helpery) i wersję podpisaną (sciągniętą z Documenso
  // po COMPLETED), oraz mapę pól podpisu (signature_anchors) — pozwala
  // automatycznie pozycjonować pola w Documenso v3 fields API i renderować
  // overlay w naszych podglądach. Soft delete (deleted_at).
  // Bez FK do mp_services (Directus REST quirk) — service_id jako uuid,
  // purge przy delete service obsługuje handler.
  {
    collection: "mp_service_documents",
    group: "mp_folder_serwis",
    meta: {
      icon: "description",
      note: "Biblioteka dokumentów per zlecenie serwisowe — oryginał + podpisana wersja PDF, integracja z Documenso (signature anchors).",
      display_template: "{{ticket_number}} — {{title}} ({{status}})",
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
        meta: { interface: "input", readonly: true, width: "half", note: "ID zlecenia (mp_services.id)." },
      },
      {
        field: "ticket_number",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "half", options: { font: "monospace" } },
      },
      {
        field: "kind",
        type: "string",
        schema: { is_nullable: false },
        meta: {
          interface: "select-dropdown",
          required: true,
          width: "half",
          display: "labels",
          options: {
            choices: [
              { text: "Potwierdzenie przyjęcia", value: "receipt" },
              { text: "Aneks", value: "annex" },
              { text: "Protokół wydania", value: "handover" },
              { text: "Kod wydania", value: "release_code" },
              { text: "Gwarancja", value: "warranty" },
              { text: "Inny", value: "other" },
            ],
          },
        },
      },
      {
        field: "title",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", width: "half", note: "Wyświetlana nazwa dokumentu (np. 'Aneks #1', 'Protokół przyjęcia')." },
      },
      {
        field: "original_pdf_file_id",
        type: "string",
        schema: { is_nullable: true },
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { font: "monospace" },
          note: "Directus file id wersji oryginalnej (niepodpisanej).",
        },
      },
      {
        field: "signed_pdf_file_id",
        type: "string",
        schema: { is_nullable: true },
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { font: "monospace" },
          note: "Directus file id wersji podpisanej (cache z Documenso po COMPLETED).",
        },
      },
      {
        field: "documenso_doc_id",
        type: "bigInteger",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "half", note: "ID dokumentu w Documenso (gdy wysłane do podpisu)." },
      },
      {
        field: "documenso_signing_url",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "full", note: "Bezpośredni link do podpisu (klient lub pracownik)." },
      },
      {
        field: "status",
        type: "string",
        schema: { default_value: "draft", is_nullable: false },
        meta: {
          interface: "select-dropdown",
          width: "half",
          display: "labels",
          options: {
            choices: [
              { text: "Szkic", value: "draft" },
              { text: "Wysłany do podpisu", value: "sent" },
              { text: "Częściowo podpisany", value: "partially_signed" },
              { text: "Podpisany", value: "signed" },
              { text: "Odrzucony", value: "rejected" },
              { text: "Wygasł", value: "expired" },
            ],
          },
        },
      },
      {
        field: "signature_anchors",
        type: "json",
        schema: { is_nullable: true },
        meta: {
          interface: "input-code",
          width: "full",
          options: { language: "json" },
          note: "Mapa pól podpisu/daty na PDF: [{role, page, x, y, width, height, kind}] (jednostki: pkt PDF).",
        },
      },
      {
        field: "related_id",
        type: "uuid",
        schema: { is_nullable: true },
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          note: "FK do encji powiązanej (np. mp_service_annexes.id).",
        },
      },
      {
        field: "related_kind",
        type: "string",
        schema: { is_nullable: true },
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Aneks", value: "annex" },
              { text: "Kod wydania", value: "release_code" },
              { text: "Potwierdzenie", value: "receipt" },
              { text: "Wydanie", value: "handover" },
              { text: "Gwarancja", value: "warranty" },
              { text: "Inny", value: "other" },
            ],
          },
        },
      },
      {
        field: "created_by_email",
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
        field: "updated_at",
        type: "timestamp",
        meta: { interface: "datetime", readonly: true, width: "half", special: ["date-updated"] },
      },
      {
        field: "deleted_at",
        type: "timestamp",
        schema: { is_nullable: true },
        meta: { interface: "datetime", readonly: true, width: "half", note: "Soft delete — null = aktywne." },
      },
    ],
  },

  // === Kody wydania (Wave 21 / Faza 1C) ===
  // 6-cyfrowy kod wydania urządzenia po finalnym statusie (delivered/closed/
  // rejected_by_customer/returned_no_repair). Generowany przy intake i wysyłany
  // wybranym kanałem (email/sms/paper). Trzymamy tylko hash (sha256+salt) —
  // plain code nigdy nie jest persistowany. UNIQUE(service_id) — 1 aktywny kod
  // per zlecenie. Lock po 5 błędnych próbach na 30 minut (locked_until).
  // Bez FK do mp_services (Directus REST quirk; service usuwany manualnie
  // wraz z kasacją zlecenia gdyby kiedyś wprowadzono delete service).
  {
    collection: "mp_service_release_codes",
    group: "mp_folder_serwis",
    meta: {
      icon: "vpn_key",
      note: "Kody wydania urządzenia (6-cyfrowy). Trzymane jako hash+salt; lock po 5 błędach na 30 min.",
      display_template: "{{ticket_number}} ({{sent_via}})",
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
        schema: { is_nullable: false, is_unique: true },
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          note: "ID zlecenia (mp_services.id). UNIQUE — 1 kod per service.",
        },
      },
      {
        field: "ticket_number",
        type: "string",
        meta: { interface: "input", readonly: true, width: "half", options: { font: "monospace" } },
      },
      {
        field: "code_hash",
        type: "string",
        schema: { is_nullable: false },
        meta: {
          interface: "input",
          readonly: true,
          width: "full",
          options: { font: "monospace" },
          note: "sha256(code+salt) — plain code nigdy nie jest persistowany.",
        },
      },
      {
        field: "code_salt",
        type: "string",
        schema: { is_nullable: false },
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          options: { font: "monospace" },
          note: "Random 16 bajtów (hex).",
        },
      },
      {
        field: "sent_via",
        type: "string",
        schema: { default_value: "none" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          display: "labels",
          options: {
            choices: [
              { text: "Email", value: "email" },
              { text: "SMS", value: "sms" },
              { text: "Papier (na potwierdzeniu)", value: "paper" },
              { text: "Brak (nie wysłano)", value: "none" },
            ],
          },
        },
      },
      {
        field: "sent_at",
        type: "timestamp",
        schema: { is_nullable: true },
        meta: { interface: "datetime", readonly: true, width: "half" },
      },
      {
        field: "used_at",
        type: "timestamp",
        schema: { is_nullable: true },
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          note: "Wypełnione gdy kod został zweryfikowany — po tym kod nieaktywny.",
        },
      },
      {
        field: "used_by_email",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "attempts",
        type: "integer",
        schema: { default_value: 0, is_nullable: false },
        meta: {
          interface: "input",
          readonly: true,
          width: "half",
          note: "Licznik nieudanych prób; reset do 0 po skutecznej weryfikacji.",
        },
      },
      {
        field: "locked_until",
        type: "timestamp",
        schema: { is_nullable: true },
        meta: {
          interface: "datetime",
          readonly: true,
          width: "half",
          note: "Po 5 błędach lock 30 min — odrzucamy verify do tego czasu.",
        },
      },
      {
        field: "created_at",
        type: "timestamp",
        schema: { default_value: "now()" },
        meta: { interface: "datetime", readonly: true, width: "half", special: ["date-created"] },
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
    group: "mp_folder_serwis",
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
              { text: "Tylko sprzedaż", value: "sales_only" },
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

  // === Notatki o kontakcie z klientem (Wave 21 / Faza 1D) ===
  // Każdy ręczny kontakt z klientem (telefon / osobiste spotkanie / inne)
  // jest tu rejestrowany — agreguje się z Chatwoot/email do jednego streamu
  // "Komunikacja z klientem" w panelu serwisanta. Nie wpływa to na auto
  // wysyłki (Postal/SMS) — to jest rękodzieło pracownika dokumentujące
  // off-channel rozmowę.
  {
    collection: "mp_service_customer_contacts",
    group: "mp_folder_serwis",
    meta: {
      icon: "support_agent",
      note: "Notatki o kontakcie z klientem off-channel (telefon / osobiście). Agregowane z Chatwoot/email w panelu.",
      display_template: "{{ticket_number}} — {{channel}} ({{contacted_at}})",
      sort_field: "-contacted_at",
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
        meta: { interface: "input", readonly: true, width: "half", note: "ID zlecenia (mp_services.id)." },
      },
      {
        field: "ticket_number",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "half", options: { font: "monospace" } },
      },
      {
        field: "channel",
        type: "string",
        schema: { default_value: "phone", is_nullable: false },
        meta: {
          interface: "select-dropdown",
          required: true,
          width: "half",
          display: "labels",
          options: {
            choices: [
              { text: "Telefon", value: "phone" },
              { text: "Osobiście", value: "in_person" },
              { text: "Inny", value: "other" },
            ],
          },
        },
      },
      {
        field: "direction",
        type: "string",
        schema: { default_value: "outbound", is_nullable: true },
        meta: {
          interface: "select-dropdown",
          width: "half",
          display: "labels",
          options: {
            choices: [
              { text: "Przychodzący", value: "inbound" },
              { text: "Wychodzący", value: "outbound" },
            ],
          },
        },
      },
      {
        field: "note",
        type: "text",
        schema: { is_nullable: false },
        meta: { interface: "input-multiline", required: true, width: "full" },
      },
      {
        field: "recorded_by_email",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "recorded_by_name",
        type: "string",
        schema: { is_nullable: true },
        meta: { interface: "input", readonly: true, width: "half" },
      },
      {
        field: "contacted_at",
        type: "timestamp",
        schema: { default_value: "now()", is_nullable: false },
        meta: { interface: "datetime", required: true, width: "half" },
      },
      {
        field: "created_at",
        type: "timestamp",
        schema: { default_value: "now()" },
        meta: { interface: "datetime", readonly: true, width: "half", special: ["date-created"] },
      },
    ],
  },
];

