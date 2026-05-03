import type { CollectionSpec } from "../types";

/**
 * Business data: kategorie/grupy targetowe, progi liczbowe per grupa,
 * punkty sprzedaży i serwisowe (mp_locations).
 */

export const BUSINESS_SPECS: CollectionSpec[] = [

  // === Grupy targetowe (kategorie produktów / usług) ===
  // Każda grupa ma swój kod, label, opis. Architektonicznie przygotowane
  // pod przyszłą integrację z zewnętrznym systemem ERP — pole external_code
  // zostanie zmapowane na ich identyfikator. Na razie pusty.
  {
    collection: "mp_target_groups",
    group: "mp_folder_business",
    meta: {
      icon: "category",
      note: "Kategorie produktów/usług dla planów punktów. Każda ma progi (mp_target_thresholds).",
      display_template: "{{label}} ({{code}})",
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
          options: { iconLeft: "tag", placeholder: "np. UCH_SAM, GWA_SZK" },
          note: "Krótki kod (CSV-friendly). Używany w API i raportach.",
        },
      },
      {
        field: "label",
        type: "string",
        schema: { is_nullable: false },
        meta: {
          interface: "input",
          required: true,
          width: "half",
          options: { iconLeft: "label" },
        },
      },
      {
        field: "description",
        type: "text",
        meta: { interface: "input-multiline", width: "full" },
      },
      {
        field: "unit",
        type: "string",
        schema: { default_value: "szt" },
        meta: {
          interface: "select-dropdown",
          width: "half",
          options: {
            choices: [
              { text: "Sztuki (szt)", value: "szt" },
              { text: "Złote (PLN)", value: "PLN" },
              { text: "Komplety", value: "kpl" },
              { text: "Godziny (h)", value: "h" },
              { text: "Inne", value: "other" },
            ],
            allowOther: true,
          },
        },
      },
      {
        field: "external_code",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "link", font: "monospace" },
          note: "Mapping do zewnętrznego systemu ERP (opcjonalnie).",
        },
      },
      {
        field: "sort",
        type: "integer",
        schema: { default_value: 0 },
        meta: {
          interface: "input",
          width: "half",
          options: { min: 0, max: 999 },
        },
      },
      {
        field: "enabled",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          width: "half",
          options: { label: "Aktywna grupa" },
        },
      },
    ],
  },

  // === Progi grup targetowych (od X do Y → wartość Z) ===
  // Pełna personalizacja per-grupa: dowolnie wiele progów, każdy z range
  // [from, to] i wartością (np. cena za szt, liczba punktów lojalnościowych,
  // procent prowizji). label opcjonalny dla custom nazwy progu.
  {
    collection: "mp_target_thresholds",
    group: "mp_folder_business",
    meta: {
      icon: "tune",
      note: "Progi liczbowe per grupa targetowa. Range [from, to] → wartość. Dowolnie wiele progów.",
      display_template: "{{group}}: {{from_value}}–{{to_value}} → {{value}}",
      sort_field: "from_value",
    },
    fields: [
      {
        field: "id",
        type: "uuid",
        schema: { is_primary_key: true },
        meta: { hidden: true, readonly: true, special: ["uuid"] },
      },
      {
        field: "group",
        type: "uuid",
        schema: { is_nullable: false },
        meta: {
          interface: "select-dropdown-m2o",
          required: true,
          width: "full",
          options: { template: "{{label}} ({{code}})" },
          special: ["m2o"],
        },
      },
      {
        field: "label",
        type: "string",
        meta: {
          interface: "input",
          width: "full",
          options: { placeholder: "np. Niski / Średni / Wysoki" },
          note: "Opcjonalna nazwa progu dla raportów (jeśli puste — generujemy z range).",
        },
      },
      {
        field: "from_value",
        type: "decimal",
        schema: { numeric_precision: 14, numeric_scale: 2, default_value: 0 },
        meta: {
          interface: "input",
          required: true,
          width: "half",
          options: { iconLeft: "trending_flat" },
          note: "OD (włącznie). Może być 0.",
        },
      },
      {
        field: "to_value",
        type: "decimal",
        schema: { numeric_precision: 14, numeric_scale: 2 },
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "trending_flat" },
          note: "DO (włącznie). Puste = bez górnego limitu.",
        },
      },
      {
        field: "value",
        type: "decimal",
        schema: { numeric_precision: 14, numeric_scale: 2, is_nullable: false },
        meta: {
          interface: "input",
          required: true,
          width: "full",
          options: { iconLeft: "calculate" },
          note: "Wartość liczona dla tego progu (np. cena, prowizja, punkty).",
        },
      },
      {
        field: "color",
        type: "string",
        meta: {
          interface: "select-color",
          width: "half",
        },
      },
      {
        field: "sort",
        type: "integer",
        schema: { default_value: 0 },
        meta: { interface: "input", width: "half" },
      },
    ],
  },

  // === Punkty (sklepy / serwisy) — dane biznesowe ===
  // Edytowalne z dashboard /admin/locations LUB bezpośrednio w Directus UI.
  // Source of truth: Directus DB. Custom dashboard UI używa Directus REST.
  {
    collection: "mp_locations",
    group: "mp_folder_panele",
    meta: {
      icon: "place",
      note: "Punkty sprzedaży i serwisowe. Każdy ma adres + lokalizację GPS, godziny otwarcia, kontakt, plan budżetu, zdjęcia, brand mailowy.",
      display_template: "{{name}} — {{type}} ({{address}})",
      sort_field: "name",
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
        field: "name",
        type: "string",
        schema: { is_nullable: false },
        meta: {
          interface: "input",
          required: true,
          width: "full",
          options: { iconLeft: "label", placeholder: "Pełna nazwa punktu" },
        },
      },
      {
        field: "warehouse_code",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "warehouse", placeholder: "TS / GKU / SC1 / …" },
          note: "Kod magazynu (skrót). Wartości typu TS, GKU, SC1.",
        },
      },
      {
        field: "type",
        type: "string",
        schema: { is_nullable: false, default_value: "sales" },
        meta: {
          interface: "select-dropdown",
          required: true,
          width: "half",
          display: "labels",
          display_options: {
            showAsDot: true,
            choices: [
              { text: "Punkt sprzedaży", value: "sales", foreground: "#fff", background: "#0EA5E9" },
              { text: "Punkt serwisowy", value: "service", foreground: "#fff", background: "#F43F5E" },
            ],
          },
          options: {
            choices: [
              { text: "Punkt sprzedaży", value: "sales" },
              { text: "Punkt serwisowy", value: "service" },
            ],
          },
        },
      },
      {
        field: "address",
        type: "string",
        meta: {
          interface: "input",
          width: "full",
          options: { iconLeft: "home", placeholder: "Pełny adres (ulica, numer, kod, miasto)" },
        },
      },
      {
        field: "lat",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 7 },
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "near_me", placeholder: "52.2297" },
          note: "Latitude (decimal degrees). Drag pin na mapie żeby ustawić.",
        },
      },
      {
        field: "lng",
        type: "decimal",
        schema: { numeric_precision: 10, numeric_scale: 7 },
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "near_me", placeholder: "21.0122" },
          note: "Longitude (decimal degrees).",
        },
      },
      {
        field: "description",
        type: "text",
        meta: {
          interface: "input-multiline",
          width: "full",
          options: { placeholder: "np. obok wejścia do galerii, parter, lokal nr 5" },
        },
      },
      {
        field: "email",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "alternate_email", placeholder: "punkt@firma.pl" },
        },
      },
      {
        field: "phone",
        type: "string",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "phone", placeholder: "+48 …" },
        },
      },
      {
        field: "hours",
        type: "json",
        meta: {
          interface: "input-code",
          width: "full",
          options: { language: "json", lineNumber: true },
          note: 'Godziny otwarcia. Format: {"mon":"08-18","tue":"08-18",...,"sun":null,"sundays_handlowe":["2026-12-21"]}',
        },
      },
      {
        field: "photos",
        type: "json",
        meta: {
          interface: "input-code",
          width: "full",
          options: { language: "json" },
          note: "Max 3 URL-i zdjęć (string[] do 3 elementów). Wyświetlane w popup mapy.",
        },
      },
      {
        field: "budget_plan",
        type: "decimal",
        schema: { numeric_precision: 12, numeric_scale: 2 },
        meta: {
          interface: "input",
          width: "half",
          display: "formatted-value",
          display_options: { suffix: " PLN" },
          options: { iconLeft: "trending_up" },
        },
      },
      {
        field: "service_id",
        type: "uuid",
        meta: {
          interface: "input",
          width: "half",
          options: { iconLeft: "build" },
          note: "TYLKO dla type=sales: UUID przypisanego punktu serwisowego (max 1).",
        },
      },
      {
        field: "sales_ids",
        type: "json",
        meta: {
          interface: "input-code",
          width: "full",
          options: { language: "json" },
          note: 'TYLKO dla type=service: lista UUID-ów podległych sklepów. Format: ["uuid1","uuid2",...]',
        },
      },
      {
        field: "requires_transport",
        type: "boolean",
        schema: { default_value: false },
        meta: {
          interface: "boolean",
          width: "half",
          options: { label: "Wymaga transportu kurierskiego" },
          note: "TYLKO dla type=sales: zlecenia z tego punktu zawsze wymagają transportu przez kierowcę (nawet do powiązanego punktu serwisowego). Bez tego flagi transport tworzy się tylko gdy sprzedawca wybrał inny serwis niż domyślny.",
        },
      },
      // Wave 22 / F1 follow-up — brand mailowy. Lokacja decyduje z którego
      // SMTP profile + layout idą maile klienta dla zleceń z tej lokacji.
      // null = global default (mp_branding.default_smtp_profile_slug).
      {
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
      },
      {
        field: "enabled",
        type: "boolean",
        schema: { default_value: true },
        meta: {
          interface: "boolean",
          width: "half",
          options: { label: "Aktywny w systemie" },
        },
      },
      {
        field: "created_at",
        type: "timestamp",
        schema: { default_value: "now()" },
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
];
