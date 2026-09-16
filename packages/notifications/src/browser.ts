import type { NotificationCategory, NotificationSeverity, NotificationSourceType } from "./types";

export { safeDestinationPath } from "./destination";
export type { NotificationCategory, NotificationSeverity, NotificationSourceType } from "./types";

/** Client-safe notification DTO shape (mirrors NotificationView). */
export type NotificationView = {
  id: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  title: string;
  body: string;
  sourceType: NotificationSourceType;
  sourceId: string | null;
  sourceIntegrationId: string | null;
  destinationPath: string | null;
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
