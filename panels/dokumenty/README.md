# Obieg Dokumentów (`dokumenty`)

Production FQDN: `dokumenty.myperformance.pl`
Access requires:
- Keycloak SSO login (client `panel-dokumenty`)
- Keycloak realm role `dokumenty_access` or `admin`
- Valid client certificate verified by Traefik mTLS middleware (terminated at edge — this app trusts its network)

## Envs

| Var | Purpose |
| --- | --- |
| `KEYCLOAK_ISSUER` | `https://auth.myperformance.pl/realms/MyPerformance` |
| `KEYCLOAK_CLIENT_ID` | `panel-dokumenty` |
| `KEYCLOAK_CLIENT_SECRET` | Keycloak confidential client secret |
| `NEXTAUTH_URL` | `https://dokumenty.myperformance.pl` |
| `NEXTAUTH_SECRET` | 32+ byte random |
