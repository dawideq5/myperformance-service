import { i18nBuilder } from "keycloakify/login";
import type { ThemeName } from "../kc.gen";

const built = i18nBuilder.withThemeName<ThemeName>().build();
const { useI18n } = built;

type I18n = typeof built.ofTypeI18n;

export { useI18n, type I18n };
