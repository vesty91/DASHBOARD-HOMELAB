import type { BadgeTone } from "@dashboard/ui";
import type {
  NotificationCategory,
  NotificationSeverity,
  NotificationSourceType,
} from "@dashboard/notifications";

export const SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  info: "Info",
  success: "Succès",
  warning: "Avertissement",
  error: "Erreur",
  critical: "Critique",
};

export const SEVERITY_TONES: Record<NotificationSeverity, BadgeTone> = {
  info: "accent",
  success: "success",
  warning: "warning",
  error: "danger",
  critical: "danger",
};

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  integration: "Intégration",
  automation: "Automation",
  system: "Système",
  security: "Sécurité",
  backup: "Sauvegarde",
};

export const SOURCE_LABELS: Record<NotificationSourceType, string> = {
  integration: "Intégration",
  automation: "Automation",
  system: "Système",
  security: "Sécurité",
  backup: "Sauvegarde",
  incident: "Incident",
};

export function formatNotificationTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("fr-FR");
  } catch {
    return "—";
  }
}

export function unreadBadgeLabel(count: number): string {
  if (count <= 0) return "Aucune notification non lue";
  if (count === 1) return "1 notification non lue";
  if (count > 99) return "99+ notifications non lues";
  return `${count} notifications non lues`;
}
