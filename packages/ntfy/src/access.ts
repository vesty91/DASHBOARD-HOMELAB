import { IntegrationError, type IntegrationActor } from "@dashboard/integrations";
import { hasPermission, type Permission } from "@dashboard/permissions";
import type { NtfyPermissionsView } from "./types";

function isActive(actor: IntegrationActor): boolean {
  return Boolean(actor.userId && actor.subject && actor.subject.status === "active");
}

function hasAny(actor: IntegrationActor, permissions: readonly Permission[]): boolean {
  if (!actor.subject) return false;
  return permissions.some((permission) => hasPermission(actor.subject!, permission));
}

export function ntfyPermissionsView(actor: IntegrationActor): NtfyPermissionsView {
  if (!isActive(actor)) return { canRead: false, canManage: false, canPublish: false };
  const integrationUse = hasAny(actor, ["integration.use", "integration.manage"]);
  const integrationInteract = hasAny(actor, ["integration.interact", "integration.manage"]);
  return {
    canRead: integrationUse && hasAny(actor, ["ntfy.read"]),
    canManage: hasAny(actor, ["integration.manage"]),
    canPublish: integrationInteract && hasAny(actor, ["ntfy.publish"]),
  };
}

export type NtfyAccessKind = "read" | "manage" | "publish";

export function assertNtfyAccess(actor: IntegrationActor, kind: NtfyAccessKind): void {
  if (!isActive(actor)) throw new IntegrationError("UNAUTHORIZED", "Authentication required");
  const view = ntfyPermissionsView(actor);
  switch (kind) {
    case "read":
      if (!view.canRead) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    case "manage":
      if (!view.canManage) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    case "publish":
      if (!view.canPublish) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    default: {
      const _exhaustive: never = kind;
      throw new IntegrationError("FORBIDDEN", String(_exhaustive));
    }
  }
}
