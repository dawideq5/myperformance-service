export function hasRole(roles: string[] | undefined, requiredRole: string): boolean {
  if (!roles) return false;
  return roles.includes(requiredRole);
}

export function hasAnyRole(roles: string[] | undefined, requiredRoles: string[]): boolean {
  if (!roles) return false;
  return requiredRoles.some(role => roles.includes(role));
}

export function isAdmin(roles: string[] | undefined): boolean {
  return hasRole(roles, "admin");
}

export function isManager(roles: string[] | undefined): boolean {
  return hasRole(roles, "manager");
}

export function isUser(roles: string[] | undefined): boolean {
  return hasRole(roles, "user");
}
