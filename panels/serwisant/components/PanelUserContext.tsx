"use client";

/**
 * Wave 20 / Faza 1G — context propagujący usera + jego permissions w dół
 * drzewa komponentów panelu serwisanta. Wcześniej `currentUserEmail` był
 * przekazywany ręcznie przez props (drilling) — teraz każdy komponent
 * może użyć `usePanelUser()` żeby dostać email + roles + flagi RBAC.
 *
 * Zródło danych: PanelHome (server-side fetched roles z NextAuth session
 * `session.user.roles`) → PanelUserProvider → useContext.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  computeServiceActionPermissions,
  type ServiceActionPermissions,
} from "@/lib/permissions";

export interface PanelUserCtx {
  email: string;
  /** Realm roles z KC access tokenu (`realm_access.roles`). */
  roles: readonly string[];
  /** Memoized permission flags pochodne od `roles`. */
  permissions: ServiceActionPermissions;
}

const Ctx = createContext<PanelUserCtx | null>(null);

export function PanelUserProvider({
  email,
  roles,
  children,
}: {
  email: string;
  roles: readonly string[];
  children: ReactNode;
}) {
  const value = useMemo<PanelUserCtx>(
    () => ({
      email,
      roles,
      permissions: computeServiceActionPermissions(roles),
    }),
    [email, roles],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePanelUser(): PanelUserCtx {
  const v = useContext(Ctx);
  if (!v) {
    // Fail-safe: jeśli context nie jest skonfigurowany, zwracamy
    // empty user bez uprawnień — komponent nie crashuje, ale RBAC
    // odrzuci wszystkie write operations. Lepsze niż białe ekrany
    // gdy ktoś zapomni opakować w provider.
    return {
      email: "",
      roles: [],
      permissions: computeServiceActionPermissions([]),
    };
  }
  return v;
}
