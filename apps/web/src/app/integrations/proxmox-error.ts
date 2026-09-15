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

export function proxmoxUserError(error: unknown): string {
  const code = readCode(error);
  const message = readMessage(error);
  switch (code) {
    case "TIMEOUT":
      return "Délai dépassé vers Proxmox.";
    case "DNS_ERROR":
      return "Le serveur Proxmox est injoignable (DNS).";
    case "TLS_ERROR":
      return "Erreur TLS vers Proxmox. Vérifiez le certificat ou la CA de confiance.";
    case "UNREACHABLE":
      return "Le serveur Proxmox est injoignable.";
    case "FORBIDDEN":
      return "Accès Proxmox refusé.";
    case "UNAUTHORIZED":
      return "Jeton API Proxmox invalide.";
    case "MISCONFIGURED":
      return "Configuration Proxmox invalide. Vérifiez l'URL, TLS et le jeton API.";
    case "VALIDATION_ERROR":
      return "Paramètres d'invité Proxmox invalides.";
    case "NOT_FOUND":
      return "Ressource Proxmox introuvable.";
    case "CONFLICT":
      return "Action Proxmox impossible : état ou configuration en conflit.";
    case "RATE_LIMITED":
    case "TOO_MANY_REQUESTS":
      return "Trop de requêtes Proxmox. Réessayez dans une minute.";
    default:
      if (/dns/i.test(message)) return "Le serveur Proxmox est injoignable (DNS).";
      if (/tls/i.test(message)) return "Erreur TLS vers Proxmox.";
      return "Proxmox est indisponible. Vérifiez l'URL et le jeton API.";
  }
}
