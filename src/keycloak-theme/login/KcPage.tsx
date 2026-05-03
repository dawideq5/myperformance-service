import { Suspense } from "react";
import type { ClassKey } from "keycloakify/login";
import DefaultPage from "keycloakify/login/DefaultPage";
import UserProfileFormFields from "keycloakify/login/UserProfileFormFields";
import type { KcContext } from "./KcContext";
import { useI18n } from "./i18n";
import Template from "./Template";

export default function KcPage(props: { kcContext: KcContext }) {
  const { kcContext } = props;
  const { i18n } = useI18n({ kcContext });

  return (
    <Suspense>
      <DefaultPage
        kcContext={kcContext}
        i18n={i18n}
        classes={classes}
        Template={Template}
        UserProfileFormFields={UserProfileFormFields}
        doUseDefaultCss={false}
        doMakeUserConfirmPassword={true}
      />
    </Suspense>
  );
}

const classes = {
  kcHtmlClass: "mp-kc-html",
  kcBodyClass: "mp-kc-body",
  kcLoginClass: "mp-kc-login",
  kcHeaderClass: "mp-kc-header",
  kcHeaderWrapperClass: "mp-kc-header-wrapper",
  kcFormCardClass: "mp-kc-card",
  kcFormHeaderClass: "mp-kc-card-header",
  kcLocaleMainClass: "mp-kc-locale",
  kcLocaleWrapperClass: "mp-kc-locale-wrapper",
  kcLocaleDropDownClass: "mp-kc-locale-dropdown",
  kcLocaleListClass: "mp-kc-locale-list",
  kcLocaleListItemClass: "mp-kc-locale-list-item",
  kcLocaleItemClass: "mp-kc-locale-link",
  kcContentWrapperClass: "mp-kc-content-wrapper",
  kcContentClass: "mp-kc-content",
  kcFormClass: "mp-kc-form",
  kcFormGroupClass: "mp-kc-form-group",
  kcFormOptionsClass: "mp-kc-form-options",
  kcFormOptionsWrapperClass: "mp-kc-form-options-wrapper",
  kcFormButtonsClass: "mp-kc-form-buttons",
  kcFormButtonsWrapperClass: "mp-kc-form-buttons-wrapper",
  kcLabelWrapperClass: "mp-kc-label-wrapper",
  kcLabelClass: "mp-kc-label",
  kcInputWrapperClass: "mp-kc-input-wrapper",
  kcInputGroup: "mp-kc-input-group",
  kcInputClass: "mp-kc-input",
  kcTextareaClass: "mp-kc-input",
  kcInputErrorMessageClass: "mp-kc-input-error",
  kcCheckInputClass: "mp-kc-checkbox",
  kcCheckboxInputClass: "mp-kc-checkbox",
  kcCheckLabelClass: "mp-kc-checkbox-label",
  kcButtonClass: "mp-kc-button",
  kcButtonPrimaryClass: "mp-kc-button-primary",
  kcButtonDefaultClass: "mp-kc-button-secondary",
  kcButtonLargeClass: "mp-kc-button-large",
  kcButtonBlockClass: "mp-kc-button-block",
  kcAlertClass: "mp-kc-alert",
  kcAlertTitleClass: "mp-kc-alert-title",
  kcInfoAreaWrapperClass: "mp-kc-info-wrapper",
  kcInfoAreaClass: "mp-kc-info-area",
  kcSignUpClass: "mp-kc-sign-up",
  kcFormSocialAccountSectionClass: "mp-kc-social-section",
  kcFormSocialAccountListClass: "mp-kc-social-list",
  kcFormSocialAccountListButtonClass: "mp-kc-social-list-button",
  kcFormSocialAccountGridItem: "mp-kc-social-grid-item",
  kcFormSocialAccountLinkClass: "mp-kc-social-link",
  kcFormSocialAccountNameClass: "mp-kc-social-name",
} satisfies { [key in ClassKey]?: string };
