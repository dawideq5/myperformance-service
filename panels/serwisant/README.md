# Panel Serwisanta (`serwisant`)

Production FQDN: `panelserwisanta.myperformance.pl`
Access requires:
- Keycloak SSO login (client `panel-serwisant`)
- Keycloak realm role `serwisant` or `admin`
- Valid client certificate verified by Traefik mTLS middleware (terminated at edge — this app trusts its network)

## Envs

| Var | Purpose |
| --- | --- |
| `KEYCLOAK_ISSUER` | `https://auth.myperformance.pl/realms/MyPerformance` |
| `KEYCLOAK_CLIENT_ID` | `panel-serwisant` |
| `KEYCLOAK_CLIENT_SECRET` | Keycloak confidential client secret |
| `NEXTAUTH_URL` | `https://panelserwisanta.myperformance.pl` |
| `NEXTAUTH_SECRET` | 32+ byte random |
