import { IntegrationError, type IntegrationActor } from "@dashboard/integrations";
import { hasPermission, type Permission } from "@dashboard/permissions";
import type { PrometheusPermissionsView } from "./types";

function isActive(actor: IntegrationActor): boolean {
  return Boolean(actor.userId && actor.subject && actor.subject.status === "active");
}

function hasAny(actor: IntegrationActor, permissions: readonly Permission[]): boolean {
  if (!actor.subject) return false;
  return permissions.some((permission) => hasPermission(actor.subject!, permission));
}

export function prometheusPermissionsView(actor: IntegrationActor): PrometheusPermissionsView {
  if (!isActive(actor)) return { canRead: false, canManage: false };
  const integrationUse = hasAny(actor, ["integration.use", "integration.manage"]);
  return {
    canRead: integrationUse && hasAny(actor, ["prometheus.read"]),
    canManage: hasAny(actor, ["integration.manage"]),
  };
}

export type PrometheusAccessKind = "read" | "manage";

export function assertPrometheusAccess(actor: IntegrationActor, kind: PrometheusAccessKind): void {
  if (!isActive(actor)) throw new IntegrationError("UNAUTHORIZED", "Authentication required");
  const view = prometheusPermissionsView(actor);
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
