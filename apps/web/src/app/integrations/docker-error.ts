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

export function dockerUserError(error: unknown): string {
  const code = readCode(error);
  const message = readMessage(error);
  switch (code) {
    case "TIMEOUT":
      return "Délai dépassé vers le socket proxy Docker.";
    case "DNS_ERROR":
      return "Le socket proxy Docker est injoignable (DNS).";
    case "TLS_ERROR":
      return "Erreur TLS vers le socket proxy Docker.";
    case "FORBIDDEN":
      return message.includes("proxy") ? message : "Accès Docker refusé.";
    case "UNAUTHORIZED":
      return "Authentification requise.";
    case "NOT_FOUND":
      return "Ressource Docker introuvable.";
    case "RATE_LIMITED":
    case "TOO_MANY_REQUESTS":
      return "Trop d'actions Docker. Réessayez dans une minute.";
    default:
      if (/dns/i.test(message)) return "Le socket proxy Docker est injoignable (DNS).";
      if (/tls/i.test(message)) return "Erreur TLS vers le socket proxy Docker.";
      return "Docker est indisponible. Vérifiez l'URL du socket proxy.";
  }
}
