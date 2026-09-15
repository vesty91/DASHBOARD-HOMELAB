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

export function qbittorrentUserError(error: unknown): string {
  const code = readCode(error);
  const message = readMessage(error);
  switch (code) {
    case "TIMEOUT":
      return "Délai dépassé vers qBittorrent.";
    case "DNS_ERROR":
      return "Le serveur qBittorrent est injoignable (DNS).";
    case "TLS_ERROR":
      return "Erreur TLS vers qBittorrent. Vérifiez le certificat ou la CA de confiance.";
    case "UNREACHABLE":
      return "Le serveur qBittorrent est injoignable.";
    case "FORBIDDEN":
      return "Accès qBittorrent refusé.";
    case "UNAUTHORIZED":
      return "Identifiants qBittorrent invalides.";
    case "MISCONFIGURED":
      return "Configuration qBittorrent invalide. Vérifiez l'URL, TLS et les identifiants.";
    case "NOT_FOUND":
      return "Ressource qBittorrent introuvable.";
    case "RATE_LIMITED":
    case "TOO_MANY_REQUESTS":
      return "Trop d'actualisations qBittorrent. Réessayez dans une minute.";
    default:
      if (/dns/i.test(message)) return "Le serveur qBittorrent est injoignable (DNS).";
      if (/tls/i.test(message)) return "Erreur TLS vers qBittorrent.";
      return "qBittorrent est indisponible. Vérifiez l'URL et les identifiants.";
  }
}
