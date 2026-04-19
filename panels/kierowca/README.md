# Panel Kierowcy (`kierowca`)

Production FQDN: `panelkierowcy.myperformance.pl`
Access requires:
- Keycloak SSO login (client `panel-kierowca`)
- Keycloak realm role `kierowca` or `admin`
- Valid client certificate verified by Traefik mTLS middleware (terminated at edge — this app trusts its network)

## Envs

| Var | Purpose |
| --- | --- |
| `KEYCLOAK_ISSUER` | `https://auth.myperformance.pl/realms/MyPerformance` |
| `KEYCLOAK_CLIENT_ID` | `panel-kierowca` |
| `KEYCLOAK_CLIENT_SECRET` | Keycloak confidential client secret |
| `NEXTAUTH_URL` | `https://panelkierowcy.myperformance.pl` |
| `NEXTAUTH_SECRET` | 32+ byte random |
