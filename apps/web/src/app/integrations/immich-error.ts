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

export function immichUserError(error: unknown): string {
  const code = readCode(error);
  const message = readMessage(error);
  switch (code) {
    case "TIMEOUT":
      return "Délai dépassé vers Immich.";
    case "DNS_ERROR":
      return "Le serveur Immich est injoignable (DNS).";
    case "TLS_ERROR":
      return "Erreur TLS vers Immich. Vérifiez le certificat ou la CA de confiance.";
    case "UNREACHABLE":
      return "Le serveur Immich est injoignable.";
    case "FORBIDDEN":
      return "Accès Immich refusé.";
    case "UNAUTHORIZED":
      return "Clé API Immich invalide.";
    case "MISCONFIGURED":
      return "Configuration Immich invalide. Vérifiez l'URL, TLS et la clé API.";
    case "NOT_FOUND":
      return "Ressource Immich introuvable.";
    case "RATE_LIMITED":
    case "TOO_MANY_REQUESTS":
      return "Trop d'actualisations Immich. Réessayez dans une minute.";
    default:
      if (/dns/i.test(message)) return "Le serveur Immich est injoignable (DNS).";
      if (/tls/i.test(message)) return "Erreur TLS vers Immich.";
      return "Immich est indisponible. Vérifiez l'URL et la clé API.";
  }
}
