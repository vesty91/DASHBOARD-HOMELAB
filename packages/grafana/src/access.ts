import { IntegrationError, type IntegrationActor } from "@dashboard/integrations";
import { hasPermission, type Permission } from "@dashboard/permissions";
import type { GrafanaPermissionsView } from "./types";

function isActive(actor: IntegrationActor): boolean {
  return Boolean(actor.userId && actor.subject && actor.subject.status === "active");
}

function hasAny(actor: IntegrationActor, permissions: readonly Permission[]): boolean {
  if (!actor.subject) return false;
  return permissions.some((permission) => hasPermission(actor.subject!, permission));
}

export function grafanaPermissionsView(actor: IntegrationActor): GrafanaPermissionsView {
  if (!isActive(actor)) return { canRead: false, canManage: false };
  const integrationUse = hasAny(actor, ["integration.use", "integration.manage"]);
  return {
    canRead: integrationUse && hasAny(actor, ["grafana.read"]),
    canManage: hasAny(actor, ["integration.manage"]),
  };
}

export type GrafanaAccessKind = "read" | "manage";

export function assertGrafanaAccess(actor: IntegrationActor, kind: GrafanaAccessKind): void {
  if (!isActive(actor)) throw new IntegrationError("UNAUTHORIZED", "Authentication required");
  const view = grafanaPermissionsView(actor);
  switch (kind) {
    case "read":
      if (!view.canRead) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    case "manage":
      if (!view.canManage) throw new IntegrationError("FORBIDDEN", "Permission denied");
      return;
    default: {
      const _exhaustive: never = kind;
      throw new IntegrationError("FORBIDDEN", String(_exhaustive));
    }
  }
}
