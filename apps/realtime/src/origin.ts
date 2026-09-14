export function isAllowedRealtimeOrigin(
  originHeader: string | string[] | undefined,
  allowedAppUrl: string | undefined,
): boolean {
  const origin = Array.isArray(originHeader) ? originHeader[0] : originHeader;
  if (!allowedAppUrl) return true;
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(allowedAppUrl).origin;
  } catch {
    return false;
  }
}
