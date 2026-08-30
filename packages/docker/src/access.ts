import { IntegrationError, type IntegrationActor } from "@dashboard/integrations";
import { hasPermission, type Permission } from "@dashboard/permissions";
import type { DockerPermissionsView } from "./types";

function isActive(actor: IntegrationActor): boolean {
  return Boolean(actor.userId && actor.subject && actor.subject.status === "active");
}

function hasAny(actor: IntegrationActor, permissions: readonly Permission[]): boolean {
  if (!actor.subject) return false;
  return permissions.some((permission) => hasPermission(actor.subject!, permission));
}

export function dockerPermissionsView(actor: IntegrationActor): DockerPermissionsView {
  if (!isActive(actor))
    return {
      canRead: false,
      canLogs: false,
      canStart: false,
      canStop: false,
      canRestart: false,
      canManage: false,
    };
  const integrationUse = hasAny(actor, ["integration.use", "integration.manage"]);
  const integrationInteract = hasAny(actor, ["integration.interact", "integration.manage"]);
  return {
    canRead: integrationUse && hasAny(actor, ["docker.read", "docker.manage"]),
    canLogs: integrationUse && hasAny(actor, ["docker.logs", "docker.manage"]),
    canStart: integrationInteract && hasAny(actor, ["docker.start", "docker.manage"]),
    canStop: integrationInteract && hasAny(actor, ["docker.stop", "docker.manage"]),
    canRestart: integrationInteract && hasAny(actor, ["docker.restart", "docker.manage"]),
    canManage: hasAny(actor, ["integration.manage"]) && hasAny(actor, ["docker.manage"]),
  };
}

export type DockerAccessKind = "read" | "logs" | "start" | "stop" | "restart";

export function assertDockerAccess(actor: IntegrationActor, kind: DockerAccessKind): void {
  if (!isActive(actor)) throw new IntegrationError("UNAUTHORIZED", "Authentication required");
  const view = dockerPermissionsView(actor);
  const allowed =
    kind === "read"
      ? view.canRead
      : kind === "logs"
        ? view.canLogs
        : kind === "start"
          ? view.canStart
          : kind === "stop"
            ? view.canStop
            : view.canRestart;
  if (!allowed) throw new IntegrationError("FORBIDDEN", "Permission denied");
}
