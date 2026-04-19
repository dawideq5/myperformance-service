FROM quay.io/keycloak/keycloak:26.6.1 AS builder

WORKDIR /opt/keycloak

COPY build_keycloak/keycloak-theme-for-kc-all-other-versions.jar /opt/keycloak/providers/myperformance-theme.jar

RUN /opt/keycloak/bin/kc.sh build --db=postgres --health-enabled=true --metrics-enabled=true

FROM quay.io/keycloak/keycloak:26.6.1

COPY --from=builder /opt/keycloak/ /opt/keycloak/

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start", "--optimized"]
