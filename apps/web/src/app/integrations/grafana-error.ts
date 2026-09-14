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

export function grafanaUserError(error: unknown): string {
  const code = readCode(error);
  const message = readMessage(error);
  switch (code) {
    case "TIMEOUT":
      return "Délai dépassé vers Grafana.";
    case "DNS_ERROR":
      return "Le serveur Grafana est injoignable (DNS).";
    case "TLS_ERROR":
      return "Erreur TLS vers Grafana. Vérifiez le certificat ou la CA de confiance.";
    case "UNREACHABLE":
      return "Le serveur Grafana est injoignable.";
    case "FORBIDDEN":
      return "Accès Grafana refusé.";
    case "UNAUTHORIZED":
      return "Jeton de compte de service Grafana invalide.";
    case "MISCONFIGURED":
      return "Configuration Grafana invalide. Vérifiez l'URL, TLS et le jeton.";
    case "NOT_FOUND":
      return "Ressource Grafana introuvable.";
    case "RATE_LIMITED":
    case "TOO_MANY_REQUESTS":
      return "Trop d'actualisations Grafana. Réessayez dans une minute.";
    default:
      if (/dns/i.test(message)) return "Le serveur Grafana est injoignable (DNS).";
      if (/tls/i.test(message)) return "Erreur TLS vers Grafana.";
      return "Grafana est indisponible. Vérifiez l'URL et le jeton de compte de service.";
  }
}
