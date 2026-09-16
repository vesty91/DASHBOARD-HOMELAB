import { NotificationError } from "./errors";

const ALLOWED =
  /^\/(integrations|automations|incidents|notifications|boards|apps|admin|account)(\/[A-Za-z0-9._~-]{1,128}){0,6}\/?$/u;

export function assertSafeDestinationPath(path: string | null | undefined): string | null {
  if (path == null || path.trim() === "") return null;
  const value = path.trim();
  if (value.length > 256)
    throw new NotificationError("VALIDATION_ERROR", "destinationPath is too long");
  if (!ALLOWED.test(value) || value.includes("..") || value.includes("//") || value.includes("?"))
    throw new NotificationError("VALIDATION_ERROR", "destinationPath is not allowlisted");
  return value;
}
