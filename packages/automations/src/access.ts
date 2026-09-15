import { hasPermission, type PermissionSubject } from "@dashboard/permissions";
import { AutomationError } from "./errors";

export type AutomationOwnerRecord = PermissionSubject & { id: string };

export type AutomationAccessKind = "read" | "manage" | "run";

export function evaluateAutomationOwner(
  owner: AutomationOwnerRecord | null,
  kind: AutomationAccessKind,
): void {
  if (!owner) throw new AutomationError("DENIED_OWNER_MISSING", "Automation owner is missing");
  if (owner.status !== "active")
    throw new AutomationError("DENIED_OWNER_DISABLED", "Automation owner is disabled");
  const permission =
    kind === "read"
      ? "automation.read"
      : kind === "manage"
        ? "automation.manage"
        : "automation.run";
  const allowed =
    hasPermission(owner, permission) ||
    (kind === "read" && hasPermission(owner, "automation.manage"));
  if (!allowed) throw new AutomationError("DENIED_PERMISSION", "Permission denied");
}
