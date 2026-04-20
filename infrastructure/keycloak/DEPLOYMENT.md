# Keycloak — wdrożenie produkcyjne

Produkcyjny Keycloak (`https://auth.myperformance.pl`) jest hostowany poza
tym repozytorium — `docker-compose.yml` w repo uruchamia tylko dashboard.
Plik `realm.json` w `infrastructure/keycloak/` jest używany wyłącznie do
importu w dev compose; na produkcji traktujemy go jako źródło prawdy,
ale zmiany aplikujemy ręcznie/poprzez Admin API.

## 1. Zbudowanie artefaktu theme

```bash
npm ci
npm run build-keycloak-theme
```

Wynik:
- `build_keycloak/keycloak-theme-for-kc-all-other-versions.jar` — dla
  Keycloak 26.x (obecna wersja prod).
- `build_keycloak/keycloak-theme-for-kc-22-to-25.jar` — dla starszych
  instancji (nieużywane na prod).

Katalog `build_keycloak/` jest gitignorowany — JAR generujemy lokalnie
albo w CI i dostarczamy jako artefakt.

## 2. Dostarczenie JAR-a do produkcyjnego Keycloaka

Keycloak wczytuje theme-providery z katalogu `/opt/keycloak/providers/`.
Potrzebny jest restart kontenera (theme nie jest hot-reloadowany).

Jeśli produkcyjny Keycloak jest uruchamiany z osobnego compose/Dockerfile
na hoście docelowym:

```bash
# na hoście Keycloaka
scp keycloak-theme-for-kc-all-other-versions.jar \
    deploy@auth.myperformance.pl:/opt/keycloak/providers/myperformance-theme.jar

# restart (Keycloak musi być zatrzymany w momencie kopiowania, żeby
# poprawnie zarejestrować providera)
docker compose restart keycloak
```

Alternatywnie, jeśli Keycloak jest budowany jako własny obraz, dodaj
JAR w Dockerfile tego obrazu (poza tym repo):

```Dockerfile
COPY myperformance-theme.jar /opt/keycloak/providers/
RUN /opt/keycloak/bin/kc.sh build
```

## 3. Role w produkcyjnym realmie

Docelowy zestaw ról (zgodny z `realm.json`):

| Rola              | Domyślna? | Opis                                                   |
|-------------------|-----------|--------------------------------------------------------|
| `app_user`        | tak       | Dostęp do dashboardu                                   |
| `manage_users`    | nie       | Zarządzanie użytkownikami realmu                       |
| `directus_access` | nie       | Dostęp SSO do Directus CMS                             |

`app_user` wchodzi w skład composite `default-roles-myperformance`, więc
każdy nowy użytkownik ją dostaje automatycznie.

### Migracja ról (wykonać raz, na prod realmie)

W Admin Console → *Realm roles*:

1. Utwórz role `app_user`, `manage_users`, `directus_access` jeśli nie
   istnieją.
2. W *Realm settings* → *User registration* → *Default roles* dodaj
   `app_user` do `default-roles-myperformance`.
3. Usuń stare role RBAC, które nie są już używane (np. dawne
   `admin`, `manager`, `user` itp. — wcześniej używane przez dashboard).
   **Przed usunięciem** sprawdź `Users` → filtrem po starej roli, że nikt
   jej nie potrzebuje, i przenieś na nowy model.

Alternatywnie skryptowo:

```bash
kcadm.sh config credentials --server https://auth.myperformance.pl \
  --realm master --user admin
kcadm.sh create roles -r MyPerformance -s name=app_user
kcadm.sh create roles -r MyPerformance -s name=manage_users
kcadm.sh create roles -r MyPerformance -s name=directus_access
kcadm.sh add-roles -r MyPerformance \
  --rname default-roles-myperformance --rolename app_user
```

## 4. Aktywacja theme `myperformance` na prod

W Admin Console:

1. *Realm settings* → *Themes* → *Login theme* → wybierz `myperformance`.
2. Zapisz.
3. Otwórz stronę logowania w trybie incognito i zweryfikuj, że używa
   nowego brandingu.

Jeśli theme nie pojawia się na liście rozwijanej — JAR nie został
poprawnie wczytany. Sprawdź logi Keycloaka: `docker logs keycloak | grep -i theme`.

## 5. Przypisanie ról (adminowie i test userzy)

Po migracji przypisz ręcznie:

- Adminom systemu: `manage_users` + `directus_access` (plus rola
  `realm-admin` z `realm-management`, jeśli mają zarządzać Keycloakiem).
- Test userom używanym do QA: zestaw minimalny — tylko `app_user`
  (wchodzi domyślnie), oraz opcjonalnie `directus_access` dla testów SSO.

Weryfikacja:

```bash
# JWT po zalogowaniu powinien zawierać w realm_access.roles:
#   ["app_user", ...]
# dla admina również "manage_users" i "directus_access".
```

## 6. Checklista wdrożeniowa (produkcja)

- [ ] `npm run build-keycloak-theme` zbudowane na czystym checkout `main`.
- [ ] JAR skopiowany do `/opt/keycloak/providers/` na hoście prod.
- [ ] Keycloak zrestartowany; w logach brak błędów ładowania providera.
- [ ] Role `app_user`, `manage_users`, `directus_access` istnieją w
      realmie `MyPerformance`.
- [ ] `app_user` jest w `default-roles-myperformance`.
- [ ] *Login theme* ustawione na `myperformance`.
- [ ] Admini mają `manage_users` i `directus_access`.
- [ ] Test user loguje się i widzi dashboard (weryfikacja golden path).
- [ ] Dashboard ukrywa panel Directus dla użytkownika bez
      `directus_access`.

## 7. Directus — błąd `User belongs to a different auth provider`

Komunikat pochodzi z Directusa (nie Keycloaka). Directus odmawia
logowania przez SSO, bo dla tego e-maila istnieje już konto
z innym providerem (np. założone wcześniej lokalnie lub pod inny
realm/SSO mapping).

### Diagnostyka

1. Zaloguj się do Directusa jako admin lokalny (nie-SSO).
2. *User Directory* → wyszukaj użytkownika po e-mailu.
3. Sprawdź pole **Provider** / **External Identifier** w profilu:
   - `default` / `local` → konto lokalne, nie zmapowane z Keycloakiem.
   - inny niż obecny provider Keycloaka → mapowanie ze starego realmu
     lub starego ID providera.
4. Sprawdź konfigurację SSO w Directusie (Settings → Project Settings →
   Auth Providers): czy `client_id`, `issuer_url`, `provider` zgadzają
   się z obecnym Keycloakiem (`myperformance-dashboard` / `MyPerformance`).

### Bezpieczne opcje naprawy

W kolejności od najmniej inwazyjnej:

1. **Wyrównaj mapowanie po stronie Directusa** — jeżeli provider się
   zmienił, zaktualizuj pole `provider` i `external_identifier`
   w rekordzie `directus_users` na wartości zwracane przez aktualny
   Keycloak (`sub` z tokena). **Nie usuwaj** użytkownika — stracisz
   relacje z kolekcjami.

2. **Merge kont** — jeśli istnieje duplikat (konto lokalne + SSO pod
   tym samym e-mailem), zdecyduj, które zachować. Najczęściej:
   - zachowaj SSO-owe (nowe), przenieś role/relacje ze starego,
   - usuń stare konto lokalne.

3. **Kasowanie i ponowne utworzenie** — dopuszczalne tylko dla kont,
   które nie mają danych powiązanych (np. świeży test user).

### Czego nie robić

- Nie wyłączaj SSO w Directusie „na szybko” — to maskuje problem,
  a nie rozwiązuje konflikt providerów.
- Nie zmieniaj client ID / realm w Keycloaku, żeby „pasował” do
  Directusa — zepsujesz logowanie do dashboardu (`myperformance-dashboard`).
- Nie czyść tabeli `directus_users` przez SQL bez backupu.

## 8. Co jest gotowe w repo / co jest poza repo

**Gotowe w repo:**
- Keycloakify theme (`src/keycloak-theme/`) + build (`npm run build-keycloak-theme`).
- Dev compose z montowaniem theme i importem realmu.
- `realm.json` jako referencyjna konfiguracja (role, client, IdP, loginTheme).
- Dashboard zaktualizowany pod nowy model RBAC (`app_user`,
  `manage_users`, `directus_access`).

**Poza repo — do wykonania ręcznie na produkcji:**
- Deploy JAR-a do `/opt/keycloak/providers/` + restart Keycloaka.
- Migracja ról w realmie `MyPerformance`.
- Ustawienie `loginTheme=myperformance`.
- Przypisanie ról adminom/test userom.
- Rozwiązanie konfliktu providera w Directusie (pkt 7).

**Uwaga:** zmiany w prod Keycloaku nie mogą być zrobione wyłącznie
z tego repo — produkcyjny Keycloak jest osobnym deploymentem.
Repo dostarcza artefakt (JAR theme) i referencyjną konfigurację —
aplikacja musi być wykonana przez osobę z dostępem do
`auth.myperformance.pl`.

## 9. Wdrożenie przez Coolify

Produkcyjny Keycloak i Directus działają jako serwisy w Coolify
(`coolify.myperformance.pl`). Coolify API v1 **nie** eksponuje
endpointa do `exec` w kontenerze — wspierane są start/stop/restart.

### 9.1 Role, loginTheme, przypisania (Keycloak Admin REST)

`SERVICE_USER_ADMIN` / `SERVICE_PASSWORD_ADMIN` z env serwisu Keycloak
pozwalają na uwierzytelnienie przez `admin-cli` w realmie `master`:

```bash
KC_URL=https://auth.myperformance.pl
TOKEN=$(curl -sS -X POST "$KC_URL/realms/master/protocol/openid-connect/token" \
  -d client_id=admin-cli -d grant_type=password \
  -d username="$KC_ADMIN_USER" --data-urlencode "password=$KC_ADMIN_PASS" \
  | jq -r .access_token)

# utwórz brakujące role (idempotentne — 201 lub 409)
for R in app_user manage_users directus_access; do
  curl -sS -X POST "$KC_URL/admin/realms/MyPerformance/roles" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"name\":\"$R\"}"
done

# ustaw login theme po wgraniu JAR (patrz 9.2)
curl -sS -X PUT "$KC_URL/admin/realms/MyPerformance" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"loginTheme":"myperformance"}'
```

### 9.2 Dostarczenie JAR do Keycloaka

Produkcyjny compose Keycloaka ma tylko `keycloak-data:/opt/keycloak/data` —
`/opt/keycloak/providers/` nie jest zamontowany, więc JAR trzeba
dostarczyć w inny sposób. Wybierz jedną z opcji:

- **(a) Web Terminal w Coolify UI** — Serwis → Terminal → `keycloak`,
  potem `curl -fsSL <URL> -o /opt/keycloak/providers/myperformance-theme.jar`
  i `/opt/keycloak/bin/kc.sh build`, następnie restart kontenera.
  Najprostsze ad-hoc; nie jest automatyczne.
- **(b) SSH na host Coolify** — `scp` JAR-a do volumu `keycloak-data`
  (`/var/lib/docker/volumes/<uuid>_keycloak-data/_data/…`), restart.
  Powtarzalne przy każdym buildzie theme.
- **(c) Init-command w compose** — dopisz w UI Coolify komendę startową
  Keycloaka pobierającą JAR z publicznego URL przy każdym starcie:
  ```yaml
  command:
    - sh
    - -c
    - |
      curl -fsSL "$THEME_URL" -o /opt/keycloak/providers/myperformance-theme.jar
      /opt/keycloak/bin/kc.sh build
      exec /opt/keycloak/bin/kc.sh start
  ```
  Wymaga hostowania JAR-a (np. GitHub Release tego repo) i restart
  serwisu pobiera świeżą wersję.

Restart przez API: `GET /api/v1/services/{uuid}/restart`.
`scripts/coolify-deploy-keycloak-theme.sh` buduje JAR i wywołuje restart
(uploadu nie robi automatycznie — wymaga ścieżki z listy wyżej).

### 9.3 Directus — fix konfliktu providera

Directus ma ustawione `AUTH_DISABLE_DEFAULT=true` — lokalny login
wyłączony, zostało tylko SSO. Nie da się wygenerować static tokena
z zewnątrz bez czasowego wyłączenia tej flagi **albo** dostępu do DB.

Bezpieczne opcje:

1. **Czasowe włączenie lokalnego loginu** — w Coolify ustaw
   `AUTH_DISABLE_DEFAULT=false`, redeploy serwisu (~30s downtime),
   zaloguj się `ADMIN_EMAIL`/`ADMIN_PASSWORD`, w *User Directory*
   zmień dla problematycznego konta **Provider** na `keycloak`
   i **External Identifier** na `sub` z tokena KC
   (z `GET /admin/realms/MyPerformance/users?email=…`). Zapisz.
   Przywróć `AUTH_DISABLE_DEFAULT=true` i redeploy.
2. **Dostęp do Postgresa Directusa** — Coolify nie wystawia portu
   DB domyślnie. Jeśli masz SSH na host, uruchom psql na
   kontenerze `postgresql` i wykonaj UPDATE na `directus_users`
   z backupem `SELECT` w tej samej transakcji.

`GET /admin/realms/MyPerformance/users?email=…` zwraca `id` (== `sub`
w tokenie), którego potrzebujesz jako `external_identifier` w Directusie.

## §10 Panele cert-gated — klienci OIDC per host

Każdy panel (sprzedawca, serwisant, kierowca, obieg dokumentów) jest
osobnym Next.js app z własnym confidential clientem OIDC w tym realmie.
Poniższa tabela wiąże host z `clientId` i wymaganą realm role.

| Host                                    | clientId            | Realm role          |
|-----------------------------------------|---------------------|---------------------|
| panelsprzedawcy.myperformance.pl        | `panel-sprzedawca`  | `sprzedawca`        |
| panelserwisanta.myperformance.pl        | `panel-serwisant`   | `serwisant`         |
| panelkierowcy.myperformance.pl          | `panel-kierowca`    | `kierowca`          |
| dokumenty.myperformance.pl              | `panel-dokumenty`   | `dokumenty_access`  |

Klienci są zadeklarowane w `realm.json` (pełny import realmu je utworzy),
ale na już-działającym Keycloaku użyj idempotentnego skryptu:

```bash
export KC_URL=https://auth.myperformance.pl
export KC_ADMIN_USER=<master-admin>
export KC_ADMIN_PASS=<master-password>
export KC_REALM=MyPerformance
export PANEL_SPRZEDAWCA_CLIENT_SECRET=$(openssl rand -base64 32)
export PANEL_SERWISANT_CLIENT_SECRET=$(openssl rand -base64 32)
export PANEL_KIEROWCA_CLIENT_SECRET=$(openssl rand -base64 32)
export PANEL_DOKUMENTY_CLIENT_SECRET=$(openssl rand -base64 32)
bash scripts/apply-realm-changes.sh
```

Skrypt jest idempotentny — pierwszy raz tworzy (`201`), każdy kolejny
wykrywa `409 Conflict` i nic nie zmienia. Secrety wklej następnie do
envów Coolify dla każdej aplikacji panelowej
(`KEYCLOAK_CLIENT_SECRET`).

Realm role (`sprzedawca`, `serwisant`, `kierowca`, `dokumenty_access`)
przypisuj ręcznie w Admin Console → *Users* → *Role mappings*, albo
masowo via `PUT /admin/realms/${KC_REALM}/users/${uid}/role-mappings/realm`.
