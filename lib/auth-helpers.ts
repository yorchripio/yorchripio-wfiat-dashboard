// lib/auth-helpers.ts
// Authorization helpers for ADMIN / VIEWER roles

export type Role = "ADMIN" | "VIEWER";

const ROLE_HIERARCHY: Record<Role, number> = {
  VIEWER: 1,
  ADMIN: 2,
};

export function hasMinRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

export function requireRole(userRole: Role, requiredRole: Role): void {
  if (!hasMinRole(userRole, requiredRole)) {
    throw new Error("FORBIDDEN");
  }
}

export function isAdmin(role: string): role is "ADMIN" {
  return role === "ADMIN";
}
