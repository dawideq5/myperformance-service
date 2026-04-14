import { ReactNode } from "react";
import { hasAnyRole } from "@/lib/role-check";

interface RoleGuardProps {
  roles: string[];
  userRoles: string[] | undefined;
  children?: ReactNode;
  fallback?: ReactNode;
}

export function RoleGuard({ roles, userRoles, children, fallback = null }: RoleGuardProps) {
  const hasAccess = hasAnyRole(userRoles, roles);

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
