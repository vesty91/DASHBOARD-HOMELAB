import { IntegrationError, parseJsonBody, type SecureHttpResult } from "@dashboard/integrations";
import { z } from "zod";
import { mapDsmErrorCode, SynologyError } from "./errors";
import { isAllowedDsmCgiPath } from "./policy";
import { dsmApiInfoSchema, dsmEnvelopeSchema } from "./schemas";

export interface DiscoveredApi {
  readonly available: boolean;
  readonly version: number | null;
  readonly reason?: "api-unavailable" | "unsupported-version" | "invalid-response";
}

export interface DiscoveredApis {
  readonly auth: DiscoveredApi & { readonly version: number };
  readonly dsmInfo: DiscoveredApi;
  readonly system: DiscoveredApi;
  readonly utilization: DiscoveredApi;
  readonly storage: DiscoveredApi;
}

export function negotiateVersion(
  serverMin: number | undefined,
  serverMax: number | undefined,
  adapterMin: number,
  adapterMax: number,
): number | null {
  if (
    (serverMin !== undefined && serverMax !== undefined && serverMax < serverMin) ||
    adapterMax < adapterMin
  )
    return null;
  const low = Math.max(serverMin ?? adapterMin, adapterMin);
  const high = Math.min(serverMax ?? adapterMax, adapterMax);
  if (high < low) return null;
  return high;
}

export function parseEnvelope(body: Buffer): { success: boolean; data: unknown; code?: number } {
  let payload: unknown;
  try {
    payload = parseJsonBody(body);
  } catch {
    throw new IntegrationError("INVALID_RESPONSE", "DSM returned invalid JSON");
  }
  const parsed = dsmEnvelopeSchema.safeParse(payload);
  if (!parsed.success) throw new IntegrationError("INVALID_RESPONSE", "DSM envelope is invalid");
  return {
    success: parsed.data.success,
    data: parsed.data.data,
    ...(typeof parsed.data.error?.code === "number" ? { code: parsed.data.error.code } : {}),
  };
}

export function requireOkEnvelope(result: SecureHttpResult, fallback: string): unknown {
  if (!result.ok) throw new IntegrationError(result.code, fallback);
  if (result.status !== 200) throw new IntegrationError("INVALID_RESPONSE", fallback);
  const envelope = parseEnvelope(result.body);
  if (!envelope.success) throw mapDsmErrorCode(envelope.code);
  return envelope.data;
}

function apiState(
  data: z.infer<typeof dsmApiInfoSchema>,
  name: string,
  adapterMin: number,
  adapterMax: number,
): DiscoveredApi {
  const entry = data[name];
  if (!entry) return { available: false, version: null, reason: "api-unavailable" };
  if (!isAllowedDsmCgiPath(entry.path))
    return { available: false, version: null, reason: "invalid-response" };
  const version = negotiateVersion(entry.minVersion, entry.maxVersion, adapterMin, adapterMax);
  if (version === null) return { available: false, version: null, reason: "unsupported-version" };
  return { available: true, version };
}

export function parseDiscoveredApis(raw: unknown): DiscoveredApis {
  const parsed = dsmApiInfoSchema.safeParse(raw);
  if (!parsed.success) throw new IntegrationError("INVALID_RESPONSE", "DSM API info is invalid");
  const auth = apiState(parsed.data, "SYNO.API.Auth", 3, 6);
  if (!auth.available || auth.version === null)
    throw new SynologyError(
      auth.reason === "unsupported-version" ? "UNSUPPORTED_VERSION" : "API_UNAVAILABLE",
      "DSM does not expose a supported Auth API",
    );
  return {
    auth: { available: true, version: auth.version },
    dsmInfo: apiState(parsed.data, "SYNO.DSM.Info", 1, 2),
    system: apiState(parsed.data, "SYNO.Core.System", 1, 3),
    utilization: apiState(parsed.data, "SYNO.Core.System.Utilization", 1, 1),
    storage: apiState(parsed.data, "SYNO.Storage.CGI.Storage", 1, 1),
  };
}
