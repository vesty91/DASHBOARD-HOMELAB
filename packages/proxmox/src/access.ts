import { IntegrationError, type IntegrationActor } from "@dashboard/integrations";
import { hasPermission, type Permission } from "@dashboard/permissions";
import type { ProxmoxGuestPowerAction, ProxmoxPermissionsView } from "./types";

function isActive(actor: IntegrationActor): boolean {
  return Boolean(actor.userId && actor.subject && actor.subject.status === "active");
}

function hasAny(actor: IntegrationActor, permissions: readonly Permission[]): boolean {
  if (!actor.subject) return false;
  return permissions.some((permission) => hasPermission(actor.subject!, permission));
}

export function proxmoxPermissionsView(actor: IntegrationActor): ProxmoxPermissionsView {
  if (!isActive(actor))
    return {
      canRead: false,
      canManage: false,
      canStart: false,
      canShutdown: false,
      canReboot: false,
    };
  const integrationUse = hasAny(actor, ["integration.use", "integration.manage"]);
  const integrationInteract = hasAny(actor, ["integration.interact", "integration.manage"]);
  return {
    canRead: integrationUse && hasAny(actor, ["proxmox.read"]),
    canManage: hasAny(actor, ["integration.manage"]),
    canStart: integrationInteract && hasAny(actor, ["proxmox.start"]),
    canShutdown: integrationInteract && hasAny(actor, ["proxmox.shutdown"]),
    canReboot: integrationInteract && hasAny(actor, ["proxmox.reboot"]),
  };
}

export type ProxmoxAccessKind = "read" | "manage" | ProxmoxGuestPowerAction;

export function assertProxmoxAccess(actor: IntegrationActor, kind: ProxmoxAccessKind): void {
  if (!isActive(actor)) throw new IntegrationError("UNAUTHORIZED", "Authentication required");
  const view = proxmoxPermissionsView(actor);
  switch (kind) {
    case "read":
      if (!view.canRead) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    case "manage":
      if (!view.canManage) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    case "start":
      if (!view.canStart) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    case "shutdown":
      if (!view.canShutdown) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    case "reboot":
      if (!view.canReboot) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    default: {
      const _exhaustive: never = kind;
      throw new IntegrationError("FORBIDDEN", String(_exhaustive));
    }
  }
}
