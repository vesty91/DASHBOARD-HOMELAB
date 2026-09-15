function readCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const record = error as { code?: unknown; cause?: unknown };
  if (typeof record.code === "string" && record.code !== "BAD_REQUEST") return record.code;
  return readCode(record.cause);
}

function readMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const record = error as { message?: unknown; cause?: unknown };
  const message = typeof record.message === "string" ? record.message : "";
  return message || readMessage(record.cause);
}

export function sonarrUserError(error: unknown): string {
  const code = readCode(error);
  const message = readMessage(error);
  switch (code) {
    case "TIMEOUT":
      return "Délai dépassé vers Sonarr.";
    case "DNS_ERROR":
      return "Le serveur Sonarr est injoignable (DNS).";
    case "TLS_ERROR":
      return "Erreur TLS vers Sonarr. Vérifiez le certificat ou la CA de confiance.";
    case "UNREACHABLE":
      return "Le serveur Sonarr est injoignable.";
    case "FORBIDDEN":
      return "Accès Sonarr refusé.";
    case "UNAUTHORIZED":
      return "Clé API Sonarr invalide.";
    case "MISCONFIGURED":
      return "Configuration Sonarr invalide. Vérifiez l'URL, TLS et la clé API.";
    case "NOT_FOUND":
      return "Ressource Sonarr introuvable.";
    case "VALIDATION_ERROR":
      return "Paramètres Sonarr invalides.";
    case "CONFLICT":
      return "Action Sonarr impossible : configuration en conflit.";
    case "RATE_LIMITED":
    case "TOO_MANY_REQUESTS":
      return "Trop de requêtes Sonarr. Réessayez dans une minute.";
    default:
      if (/dns/i.test(message)) return "Le serveur Sonarr est injoignable (DNS).";
      if (/tls/i.test(message)) return "Erreur TLS vers Sonarr.";
      return "Sonarr est indisponible. Vérifiez l'URL et la clé API.";
  }
}
