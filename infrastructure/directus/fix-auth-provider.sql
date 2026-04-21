-- Naprawa kont, które zostały utworzone lokalnie i nie mogą zalogować się
-- przez Keycloak OIDC ("User belongs to a different auth provider").
--
-- Plan:
--   1. Wszystkie konta z providerem `default` przepinamy na `keycloak`.
--   2. `external_identifier` ustawiamy na znormalizowany (lower-case) email,
--      żeby pasował do wartości przychodzącej z Keycloak (identifier_key=email).
--   3. Kasujemy lokalne hasło, żeby zapobiec ponownemu logowaniu lokalnemu.
--
-- Idempotentne: re-run jest bezpieczny.

BEGIN;

UPDATE directus_users
   SET provider            = 'keycloak',
       external_identifier = LOWER(email),
       password            = NULL
 WHERE provider = 'default'
   AND email IS NOT NULL;

-- Jeżeli było wcześniej konto z providerem `keycloak` i tym samym emailem,
-- usuwamy duplikat (zachowujemy wersję z pełniejszym profilem).
WITH ranked AS (
  SELECT id,
         email,
         ROW_NUMBER() OVER (
           PARTITION BY LOWER(email)
           ORDER BY
             CASE WHEN last_access IS NOT NULL THEN 0 ELSE 1 END,
             last_access DESC NULLS LAST,
             id
         ) AS rn
    FROM directus_users
   WHERE email IS NOT NULL
)
DELETE FROM directus_users du
 USING ranked r
 WHERE du.id = r.id
   AND r.rn > 1;

COMMIT;
