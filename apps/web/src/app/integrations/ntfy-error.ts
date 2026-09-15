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

export function ntfyUserError(error: unknown): string {
  const code = readCode(error);
  const message = readMessage(error);
  switch (code) {
    case "TIMEOUT":
      return "Délai dépassé vers ntfy.";
    case "DNS_ERROR":
      return "Le serveur ntfy est injoignable (DNS).";
    case "TLS_ERROR":
      return "Erreur TLS vers ntfy. Vérifiez le certificat ou la CA de confiance.";
    case "UNREACHABLE":
      return "Le serveur ntfy est injoignable.";
    case "FORBIDDEN":
      return "Accès ntfy refusé.";
    case "UNAUTHORIZED":
      return "Jeton d'accès ntfy invalide.";
    case "MISCONFIGURED":
      return "Configuration ntfy invalide. Vérifiez l'URL et TLS.";
    case "VALIDATION_ERROR":
      return "Paramètres ntfy invalides.";
    case "NOT_FOUND":
      return "Ressource ntfy introuvable.";
    case "CONFLICT":
      return "Action ntfy impossible : configuration en conflit.";
    case "RATE_LIMITED":
    case "TOO_MANY_REQUESTS":
      return "Trop de requêtes ntfy. Réessayez dans une minute.";
    default:
      if (/dns/i.test(message)) return "Le serveur ntfy est injoignable (DNS).";
      if (/tls/i.test(message)) return "Erreur TLS vers ntfy.";
      return "ntfy est indisponible. Vérifiez l'URL et le jeton d'accès optionnel.";
  }
}
