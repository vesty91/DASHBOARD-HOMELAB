import { createHash } from "node:crypto";
import { safeDestinationPath } from "./destination";
import type { NotificationRecord } from "./service";

export type SafePushPayload = {
  title: string;
  body: string;
  tag: string;
  data: {
    path: string;
    notificationId: string;
  };
};

/** Lock-screen default: minimal, no titles/bodies/emails/torrent names/raw errors. */
export function buildSafePushPayload(notification: NotificationRecord): SafePushPayload {
  const path = safeDestinationPath(notification.destinationPath) ?? "/notifications";
  return {
    title: "Homelab Dashboard",
    body: "You have a new notification",
    tag: notification.id,
    data: {
      path,
      notificationId: notification.id,
    },
  };
}

export function hashPushEndpoint(endpoint: string): string {
  return createHash("sha256").update(endpoint, "utf8").digest("hex");
}
