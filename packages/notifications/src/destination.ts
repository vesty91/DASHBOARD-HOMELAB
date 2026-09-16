import { NotificationError } from "./errors";

const ALLOWED =
  /^\/(integrations|automations|incidents|notifications|boards|apps|admin|account)(\/[A-Za-z0-9._~-]{1,128}){0,6}\/?$/u;

export function safeDestinationPath(path: string | null | undefined): string | null {
  if (path == null || path.trim() === "") return null;
  const value = path.trim();
  if (value.length > 256) return null;
  if (!ALLOWED.test(value) || value.includes("..") || value.includes("//") || value.includes("?"))
    return null;
  return value;
}

export function assertSafeDestinationPath(path: string | null | undefined): string | null {
  const safe = safeDestinationPath(path);
  if (path != null && path.trim() !== "" && safe == null)
    throw new NotificationError(
      "VALIDATION_ERROR",
      path.trim().length > 256
        ? "destinationPath is too long"
        : "destinationPath is not allowlisted",
    );
  return safe;
}
