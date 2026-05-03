// Custom Keycloakify Template — re-creates the MyPerformance design
// system login chrome (mp-login__bg/grid layers, mp-login__topbar with
// theme toggle, wordmark, mp-login__card) around Keycloak's per-page
// form/info nodes. Behaviour is 1:1 with keycloakify's default Template:
// preserves displayInfo / displayMessage / displayRequiredFields, the
// auth.showUsername attempted-username block, the try-another-way form
// and the locale switcher. Only the visual wrapping changes.
//
// Mirrors design-handoff/Login.jsx (.mp-login, .mp-login__bg,
// .mp-login__grid, .mp-login__topbar, .mp-login__card,
// .mp-login__brandhead h1.mp-login__brand, .mp-login__panelhead).

import { useEffect } from "react";
import { clsx } from "keycloakify/tools/clsx";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import { useSetClassName } from "keycloakify/tools/useSetClassName";
import { useInitialize } from "keycloakify/login/Template.useInitialize";
import type { TemplateProps } from "keycloakify/login/TemplateProps";
import type { I18n } from "./i18n";
import type { KcContext } from "./KcContext";
import { ThemeToggle } from "./ThemeToggle";

export default function Template(props: TemplateProps<KcContext, I18n>) {
  const {
    displayInfo = false,
    displayMessage = true,
    displayRequiredFields = false,
    headerNode,
    socialProvidersNode = null,
    infoNode = null,
    documentTitle,
    bodyClassName,
    kcContext,
    i18n,
    doUseDefaultCss,
    classes,
    children,
  } = props;

  const { kcClsx } = getKcClsx({ doUseDefaultCss, classes });
  const { msg, msgStr, currentLanguage, enabledLanguages } = i18n;
  const { realm, auth, url, message, isAppInitiatedAction } = kcContext;

  useEffect(() => {
    document.title =
      documentTitle ?? msgStr("loginTitle", realm.displayName || realm.name);
  }, [documentTitle, msgStr, realm.displayName, realm.name]);

  useSetClassName({ qualifiedName: "html", className: kcClsx("kcHtmlClass") });
  useSetClassName({
    qualifiedName: "body",
    className: bodyClassName ?? kcClsx("kcBodyClass"),
  });

  const { isReadyToRender } = useInitialize({ kcContext, doUseDefaultCss });
  if (!isReadyToRender) {
    return null;
  }

  return (
    <div className={clsx("mp-login", kcClsx("kcLoginClass"))}>
      <div className="mp-login__bg" aria-hidden="true" />
      <div className="mp-login__grid" aria-hidden="true" />

      <div className="mp-login__topbar">
        <ThemeToggle />
      </div>

      <div className={clsx("mp-login__card", "mp-enter", kcClsx("kcFormCardClass"))}>
        <div className="mp-login__brandhead">
          <h1 className="mp-login__brand">MyPerformance</h1>
        </div>

        <div className={clsx("mp-login__panelhead", kcClsx("kcFormHeaderClass"))}>
          {enabledLanguages.length > 1 && (
            <div className={kcClsx("kcLocaleMainClass")} id="kc-locale">
              <div
                id="kc-locale-wrapper"
                className={kcClsx("kcLocaleWrapperClass")}
              >
                <div
                  id="kc-locale-dropdown"
                  className={clsx("menu-button-links", kcClsx("kcLocaleDropDownClass"))}
                >
                  <button
                    tabIndex={1}
                    id="kc-current-locale-link"
                    aria-label={msgStr("languages")}
                    aria-haspopup="true"
                    aria-expanded="false"
                    aria-controls="language-switch1"
                    type="button"
                  >
                    {currentLanguage.label}
                  </button>
                  <ul
                    role="menu"
                    tabIndex={-1}
                    aria-labelledby="kc-current-locale-link"
                    aria-activedescendant=""
                    id="language-switch1"
                    className={kcClsx("kcLocaleListClass")}
                  >
                    {enabledLanguages.map(({ languageTag, label, href }, i) => (
                      <li
                        key={languageTag}
                        className={kcClsx("kcLocaleListItemClass")}
                        role="none"
                      >
                        <a
                          role="menuitem"
                          id={`language-${i + 1}`}
                          className={kcClsx("kcLocaleItemClass")}
                          href={href}
                        >
                          {label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {(() => {
            const node =
              !(auth !== undefined && auth.showUsername && !auth.showResetCredentials) ? (
                <h1 id="kc-page-title">{headerNode}</h1>
              ) : (
                <div id="kc-username" className={kcClsx("kcFormGroupClass")}>
                  <label id="kc-attempted-username">{auth.attemptedUsername}</label>
                  <a
                    id="reset-login"
                    href={url.loginRestartFlowUrl}
                    aria-label={msgStr("restartLoginTooltip")}
                  >
                    <div className="kc-login-tooltip">
                      <i className={kcClsx("kcResetFlowIcon")} />
                      <span className="kc-tooltip-text">
                        {msg("restartLoginTooltip")}
                      </span>
                    </div>
                  </a>
                </div>
              );

            if (displayRequiredFields) {
              return (
                <div className={kcClsx("kcContentWrapperClass")}>
                  <div className={clsx(kcClsx("kcLabelWrapperClass"), "subtitle")}>
                    <span className="subtitle">
                      <span className="required">*</span>
                      {msg("requiredFields")}
                    </span>
                  </div>
                  <div className="col-md-10">{node}</div>
                </div>
              );
            }

            return node;
          })()}
        </div>

        <div id="kc-content">
          <div id="kc-content-wrapper">
            {displayMessage &&
              message !== undefined &&
              (message.type !== "warning" || !isAppInitiatedAction) && (
                <div
                  className={clsx(
                    `alert-${message.type}`,
                    kcClsx("kcAlertClass"),
                    `pf-m-${message?.type === "error" ? "danger" : message.type}`,
                  )}
                >
                  <div className="pf-c-alert__icon">
                    {message.type === "success" && (
                      <span className={kcClsx("kcFeedbackSuccessIcon")} />
                    )}
                    {message.type === "warning" && (
                      <span className={kcClsx("kcFeedbackWarningIcon")} />
                    )}
                    {message.type === "error" && (
                      <span className={kcClsx("kcFeedbackErrorIcon")} />
                    )}
                    {message.type === "info" && (
                      <span className={kcClsx("kcFeedbackInfoIcon")} />
                    )}
                  </div>
                  <span
                    className={kcClsx("kcAlertTitleClass")}
                    dangerouslySetInnerHTML={{
                      __html: kcSanitize(message.summary),
                    }}
                  />
                </div>
              )}

            {children}

            {auth !== undefined && auth.showTryAnotherWayLink && (
              <form
                id="kc-select-try-another-way-form"
                action={url.loginAction}
                method="post"
              >
                <div className={kcClsx("kcFormGroupClass")}>
                  <input type="hidden" name="tryAnotherWay" value="on" />
                  <a
                    href="#"
                    id="try-another-way"
                    onClick={(event) => {
                      (
                        document.forms as unknown as Record<
                          string,
                          HTMLFormElement
                        >
                      )["kc-select-try-another-way-form"].requestSubmit();
                      event.preventDefault();
                      return false;
                    }}
                  >
                    {msg("doTryAnotherWay")}
                  </a>
                </div>
              </form>
            )}

            {socialProvidersNode}

            {displayInfo && (
              <div id="kc-info" className={kcClsx("kcSignUpClass")}>
                <div
                  id="kc-info-wrapper"
                  className={kcClsx("kcInfoAreaWrapperClass")}
                >
                  {infoNode}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
