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

export function uptimeKumaUserError(error: unknown): string {
  const code = readCode(error);
  const message = readMessage(error);
  switch (code) {
    case "TIMEOUT":
      return "Délai dépassé vers Uptime Kuma.";
    case "DNS_ERROR":
      return "Le serveur Uptime Kuma est injoignable (DNS).";
    case "TLS_ERROR":
      return "Erreur TLS vers Uptime Kuma. Vérifiez le certificat ou la CA de confiance.";
    case "UNREACHABLE":
      return "Le serveur Uptime Kuma est injoignable.";
    case "FORBIDDEN":
      return "Accès Uptime Kuma refusé.";
    case "UNAUTHORIZED":
      return "Clé API Uptime Kuma invalide.";
    case "MISCONFIGURED":
      return "Configuration Uptime Kuma invalide. Vérifiez l'URL, TLS et la clé API.";
    case "NOT_FOUND":
      return "Ressource Uptime Kuma introuvable.";
    case "RATE_LIMITED":
    case "TOO_MANY_REQUESTS":
      return "Trop d'actualisations Uptime Kuma. Réessayez dans une minute.";
    default:
      if (/dns/i.test(message)) return "Le serveur Uptime Kuma est injoignable (DNS).";
      if (/tls/i.test(message)) return "Erreur TLS vers Uptime Kuma.";
      return "Uptime Kuma est indisponible. Vérifiez l'URL et la clé API.";
  }
}
