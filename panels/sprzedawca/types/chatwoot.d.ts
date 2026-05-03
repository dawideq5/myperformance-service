// Wave22 / F14 — typy dla Chatwoot Website SDK.
//
// Ładowane runtime przez `<script src="{baseUrl}/packs/js/sdk.js">`. SDK
// po załadowaniu wystawia dwa globale: `chatwootSDK` (boot API) oraz
// `$chatwoot` (instance API), a po pełnej inicjalizacji wysyła event
// `chatwoot:ready` na window.
//
// Uwagi:
// - `setCustomAttributes` ustawia atrybuty na poziomie KONTAKTU (contact),
//   nie konwersacji. Nadpisuje wartości między sesjami — używamy go
//   świadomie, bo dla naszego use-case "co aktualnie ogląda sprzedawca"
//   to jest pożądane zachowanie.
// - `setConversationCustomAttributes` istnieje od Chatwoot v3+, ale nie
//   wszystkie deploye go wspierają — sprawdzamy `typeof === "function"`
//   przed użyciem.

export type ChatwootUserAttributes = {
  email?: string;
  name?: string;
  avatar_url?: string;
  identifier_hash?: string;
  phone_number?: string;
  description?: string;
  country_code?: string;
  city?: string;
  company_name?: string;
};

export type ChatwootCustomAttributes = Record<
  string,
  string | number | boolean | null
>;

export type ChatwootSDKConfig = {
  websiteToken: string;
  baseUrl: string;
  // Pozostawione opcjonalnie żeby nie blokować przyszłych override'ów:
  position?: "left" | "right";
  locale?: string;
  type?: "standard" | "expanded_bubble";
  launcherTitle?: string;
  hideMessageBubble?: boolean;
  showPopoutButton?: boolean;
};

export interface ChatwootSDK {
  run: (cfg: ChatwootSDKConfig) => void;
}

export interface ChatwootInstance {
  hasLoaded?: boolean;
  toggle: (state?: "open" | "close") => void;
  toggleBubbleVisibility: (state: "show" | "hide") => void;
  popoutChatWindow: () => void;
  setUser: (identifier: string, attrs: ChatwootUserAttributes) => void;
  setCustomAttributes: (attrs: ChatwootCustomAttributes) => void;
  // Tylko Chatwoot v3+. Walidujemy runtime przed wywołaniem.
  setConversationCustomAttributes?: (attrs: ChatwootCustomAttributes) => void;
  deleteCustomAttribute: (key: string) => void;
  deleteConversationCustomAttribute?: (key: string) => void;
  setLocale: (locale: string) => void;
  setLabel: (label: string) => void;
  removeLabel: (label: string) => void;
  reset: () => void;
}

declare global {
  interface Window {
    chatwootSDK?: ChatwootSDK;
    $chatwoot?: ChatwootInstance;
    chatwootSettings?: {
      hideMessageBubble?: boolean;
      position?: "left" | "right";
      locale?: string;
      type?: "standard" | "expanded_bubble";
      launcherTitle?: string;
      showPopoutButton?: boolean;
    };
  }

  interface WindowEventMap {
    "chatwoot:ready": CustomEvent<void>;
    "chatwoot:on-message": CustomEvent<unknown>;
    "chatwoot:error": CustomEvent<unknown>;
  }
}

export {};
