import { IntegrationError, type IntegrationActor } from "@dashboard/integrations";
import { hasPermission, type Permission } from "@dashboard/permissions";
import type { SynologyPermissionsView } from "./types";

function isActive(actor: IntegrationActor): boolean {
  return Boolean(actor.userId && actor.subject && actor.subject.status === "active");
}

function hasAny(actor: IntegrationActor, permissions: readonly Permission[]): boolean {
  if (!actor.subject) return false;
  return permissions.some((permission) => hasPermission(actor.subject!, permission));
}

export function synologyPermissionsView(actor: IntegrationActor): SynologyPermissionsView {
  if (!isActive(actor)) return { canRead: false, canManageAuth: false };
  const integrationUse = hasAny(actor, ["integration.use", "integration.manage"]);
  return {
    canRead: integrationUse && hasAny(actor, ["synology.read"]),
    canManageAuth: hasAny(actor, ["integration.manage"]),
  };
}

export type SynologyAccessKind = "read" | "manageAuth";

export function assertSynologyAccess(actor: IntegrationActor, kind: SynologyAccessKind): void {
  if (!isActive(actor)) throw new IntegrationError("UNAUTHORIZED", "Authentication required");
  const view = synologyPermissionsView(actor);
  switch (kind) {
    case "read":
      if (!view.canRead) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    case "manageAuth":
      if (!view.canManageAuth) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    default: {
      const _exhaustive: never = kind;
      throw new IntegrationError("FORBIDDEN", String(_exhaustive));
    }
  }
}
