# Panel Sprzedawcy (`sprzedawca`)

Production FQDN: `panelsprzedawcy.myperformance.pl`
Access requires:
- Keycloak SSO login (client `panel-sprzedawca`)
- Keycloak realm role `sprzedawca` or `admin`
- Valid client certificate verified by Traefik mTLS middleware (terminated at edge — this app trusts its network)

## Envs

| Var | Purpose |
| --- | --- |
| `KEYCLOAK_ISSUER` | `https://auth.myperformance.pl/realms/MyPerformance` |
| `KEYCLOAK_CLIENT_ID` | `panel-sprzedawca` |
| `KEYCLOAK_CLIENT_SECRET` | Keycloak confidential client secret |
| `NEXTAUTH_URL` | `https://panelsprzedawcy.myperformance.pl` |
| `NEXTAUTH_SECRET` | 32+ byte random |
