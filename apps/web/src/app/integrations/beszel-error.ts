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

export function beszelUserError(error: unknown): string {
  const code = readCode(error);
  const message = readMessage(error);
  switch (code) {
    case "TIMEOUT":
      return "Délai dépassé vers Beszel.";
    case "DNS_ERROR":
      return "Le serveur Beszel est injoignable (DNS).";
    case "TLS_ERROR":
      return "Erreur TLS vers Beszel. Vérifiez le certificat ou la CA de confiance.";
    case "UNREACHABLE":
      return "Le serveur Beszel est injoignable.";
    case "FORBIDDEN":
      return "Accès Beszel refusé.";
    case "UNAUTHORIZED":
      return "Identifiant ou mot de passe Beszel invalide.";
    case "MISCONFIGURED":
      return "Configuration Beszel invalide. Vérifiez l'URL, TLS et l'identifiant.";
    case "NOT_FOUND":
      return "Ressource Beszel introuvable.";
    case "RATE_LIMITED":
    case "TOO_MANY_REQUESTS":
      return "Trop d'actualisations Beszel. Réessayez dans une minute.";
    default:
      if (/dns/i.test(message)) return "Le serveur Beszel est injoignable (DNS).";
      if (/tls/i.test(message)) return "Erreur TLS vers Beszel.";
      return "Beszel est indisponible. Vérifiez l'URL et le mot de passe.";
  }
}
