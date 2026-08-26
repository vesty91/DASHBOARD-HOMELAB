import { hasPermission } from "@dashboard/permissions";
import type { BoardAccessContext, BoardResourcePermission } from "./types";
const rank: Readonly<Record<BoardResourcePermission, number>> = {
  "board.view": 1,
  "board.edit": 2,
  "board.manage": 3,
};
export function canAccessBoard(
  context: BoardAccessContext,
  required: BoardResourcePermission,
): boolean {
  const { actor, board, resourcePermissions } = context;
  if (required === "board.view" && board.visibility === "public") return true;
  if (!actor.userId || !actor.subject || actor.subject.status !== "active") return false;
  if (actor.subject.isSystemAdmin || hasPermission(actor.subject, "board.manage.all")) return true;
  if (actor.userId === board.ownerUserId) return true;
  if (
    required === "board.view" &&
    (hasPermission(actor.subject, "board.read.all") || board.visibility === "authenticated")
  )
    return true;
  return resourcePermissions.some((permission) => rank[permission] >= rank[required]);
}
