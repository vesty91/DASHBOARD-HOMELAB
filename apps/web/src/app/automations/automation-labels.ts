export const TRIGGER_LABELS = {
  schedule: "Planification",
  event: "Événement",
  "status-transition": "Transition de statut",
} as const;

export const RUN_STATUS_LABELS: Record<string, string> = {
  scheduled: "Planifié",
  running: "En cours",
  succeeded: "Réussi",
  failed: "Échoué",
  skipped: "Ignoré",
  denied: "Refusé",
  unknown: "Inconnu",
};

export const DRY_RUN_LABELS = {
  "would-run": "S’exécuterait",
  "would-skip": "Serait ignoré",
  "would-deny": "Serait refusé",
} as const;

export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("fr-FR");
  } catch {
    return "—";
  }
}
