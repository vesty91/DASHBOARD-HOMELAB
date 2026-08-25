export const PERMISSIONS = [
  "user.read",
  "user.manage",
  "group.read",
  "group.manage",
  "board.create",
  "board.read.all",
  "board.manage.all",
  "app.read",
  "app.manage",
  "integration.create",
  "integration.read",
  "integration.manage",
  "settings.read",
  "settings.manage",
  "backup.manage",
  "audit.read",
  "board.view",
  "board.edit",
  "board.manage",
  "integration.use",
  "integration.interact",
  "docker.read",
  "docker.logs",
  "docker.start",
  "docker.stop",
  "docker.restart",
  "docker.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const ROLE_NAMES = ["SYSTEM_ADMIN", "ADMIN", "EDITOR", "USER", "VIEWER"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];
const viewer: readonly Permission[] = ["app.read", "integration.read"];
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<RoleName, readonly Permission[]>> = {
  VIEWER: viewer,
  USER: [...viewer, "board.create"],
  EDITOR: [...viewer, "board.create", "board.edit"],
  ADMIN: [
    ...viewer,
    "board.create",
    "board.read.all",
    "board.manage.all",
    "user.read",
    "user.manage",
    "group.read",
    "group.manage",
    "app.manage",
    "integration.create",
    "integration.manage",
  ],
  SYSTEM_ADMIN: PERMISSIONS,
};
export interface PermissionSubject {
  status: "active" | "disabled";
  isSystemAdmin: boolean;
  directPermissions?: readonly string[];
  groupPermissions?: readonly string[];
}
export class PermissionError extends Error {
  readonly code = "FORBIDDEN";
}
export function resolvePermissions(subject: PermissionSubject): ReadonlySet<Permission> {
  if (subject.status !== "active") return new Set();
  if (subject.isSystemAdmin) return new Set(PERMISSIONS);
  const known = new Set<string>(PERMISSIONS);
  return new Set(
    [...(subject.directPermissions ?? []), ...(subject.groupPermissions ?? [])].filter(
      (value): value is Permission => known.has(value),
    ),
  );
}
export function hasPermission(subject: PermissionSubject, permission: Permission): boolean {
  return resolvePermissions(subject).has(permission);
}
export function requirePermission(subject: PermissionSubject, permission: Permission): void {
  if (!hasPermission(subject, permission)) throw new PermissionError("Permission denied");
}
