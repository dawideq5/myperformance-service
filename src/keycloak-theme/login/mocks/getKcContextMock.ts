import { createGetKcContextMock } from "keycloakify/login/KcContext";
import type {
  KcContextExtension,
  KcContextExtensionPerPage,
} from "../KcContext";

const { getKcContextMock } = createGetKcContextMock<
  KcContextExtension,
  KcContextExtensionPerPage
>({
  kcContextExtension: {
    themeName: "myperformance",
    properties: {},
  },
  kcContextExtensionPerPage: {},
});

export { getKcContextMock };
