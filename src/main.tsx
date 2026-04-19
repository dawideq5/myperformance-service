import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { KcPage } from "./keycloak-theme/kc.gen";
import { getKcContextMock } from "./keycloak-theme/login/mocks/getKcContextMock";
import "./keycloak-theme/styles.css";

const kcContext =
  window.kcContext ??
  getKcContextMock({
    pageId: "login.ftl",
    overrides: {},
  });

const container = document.getElementById("root");

if (!container) {
  throw new Error("Missing root container");
}

createRoot(container).render(
  <StrictMode>
    <KcPage kcContext={kcContext} />
  </StrictMode>,
);
