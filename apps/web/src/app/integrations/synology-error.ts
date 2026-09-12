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

export function synologyUserError(error: unknown): string {
  const code = readCode(error);
  const message = readMessage(error);
  switch (code) {
    case "TIMEOUT":
      return "Délai dépassé vers DSM.";
    case "DNS_ERROR":
      return "Le NAS Synology est injoignable (DNS).";
    case "TLS_ERROR":
      return "Erreur TLS vers DSM. Vérifiez le certificat ou la CA de confiance.";
    case "UNREACHABLE":
      return "Le NAS Synology est injoignable.";
    case "FORBIDDEN":
      return message.includes("privilège") ? message : "Accès DSM refusé.";
    case "UNAUTHORIZED":
      return message.includes("Identifiants") || message.includes("OTP")
        ? message
        : "Identifiants DSM invalides.";
    case "MISCONFIGURED":
      return message.includes("deux facteurs")
        ? message
        : "Configuration Synology invalide. Vérifiez l'URL, TLS et les identifiants.";
    case "NOT_FOUND":
      return "Ressource Synology introuvable.";
    case "RATE_LIMITED":
    case "TOO_MANY_REQUESTS":
      return "Trop d'actualisations Synology. Réessayez dans une minute.";
    default:
      if (/dns/i.test(message)) return "Le NAS Synology est injoignable (DNS).";
      if (/tls/i.test(message)) return "Erreur TLS vers DSM.";
      return "Synology DSM est indisponible. Vérifiez l'URL et les identifiants.";
  }
}
