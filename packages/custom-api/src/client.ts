import { IntegrationError, type IntegrationClientContext } from "@dashboard/integrations";
import { mapCustomApiValue, parseJsonValue } from "./dto";
import { CustomApiError, sectionReasonFromError, toIntegrationError } from "./errors";
import type { CustomApiConfig, CustomApiSecrets } from "./schemas";
import {
  CUSTOM_API_JSON_MAX_BYTES,
  customApiFetch,
  type CustomApiRequestFn,
  type CustomApiTransportContext,
} from "./transport";
import type {
  CustomApiDisplayMode,
  CustomApiOverview,
  CustomApiOverviewStatus,
  CustomApiProbeDto,
  CustomApiSection,
  CustomApiSectionReason,
  CustomApiValueResult,
} from "./types";

export const OVERVIEW_CACHE_TTL_MS = 8_000;
export const OVERVIEW_PARTIAL_CACHE_TTL_MS = 5_000;
export const CUSTOM_API_OVERVIEW_FAILURE_TTL_MS = 15_000;

export interface CustomApiClientContext extends CustomApiTransportContext {
  readonly request: CustomApiRequestFn;
  readonly secretValues: readonly string[];
  readonly endpoints: readonly { key: string; label: string; path: string }[];
}

export function customApiContextFromIntegration(
  ctx: IntegrationClientContext<CustomApiConfig, CustomApiSecrets> & {
    secretValues?: readonly string[];
  },
): CustomApiClientContext {
  const trustedCaPem =
    typeof ctx.config.trustedCaPem === "string" ? ctx.config.trustedCaPem : undefined;
  const bearerToken =
    typeof ctx.secrets.bearerToken === "string" && ctx.secrets.bearerToken.length > 0
      ? ctx.secrets.bearerToken
      : undefined;
  const apiKey =
    typeof ctx.secrets.apiKey === "string" && ctx.secrets.apiKey.length > 0
      ? ctx.secrets.apiKey
      : undefined;
  const secretValues =
    ctx.secretValues ?? [bearerToken, apiKey].filter((value): value is string => Boolean(value));
  return {
    baseUrl: ctx.baseUrl,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    allowedPaths: ctx.config.endpoints.map((endpoint) => endpoint.path),
    endpoints: ctx.config.endpoints,
    request: ctx.request,
    secretValues,
    ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
    ...(bearerToken === undefined ? {} : { bearerToken }),
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(ctx.config.apiKeyHeader === undefined ? {} : { apiKeyHeader: ctx.config.apiKeyHeader }),
  };
}

function sectionFromError<T>(error: unknown): CustomApiSection<T> {
  return { status: "unavailable", data: null, reason: sectionReasonFromError(error) };
}

async function readJson(ctx: CustomApiClientContext, pathname: string): Promise<unknown> {
  const result = await customApiFetch(ctx.request, ctx, "GET", pathname, {
    maxBodyBytes: CUSTOM_API_JSON_MAX_BYTES,
  });
  return parseJsonValue(result.body);
}

export async function testCustomApiConnection(
  ctx: CustomApiClientContext,
): Promise<CustomApiProbeDto> {
  const first = ctx.endpoints[0];
  if (!first) throw new IntegrationError("MISCONFIGURED", "Custom API endpoints are missing");
  await readJson(ctx, first.path);
  return { endpointKey: first.key, json: true };
}

export function overviewCacheTtl(status: CustomApiOverviewStatus): number {
  return status === "available" ? OVERVIEW_CACHE_TTL_MS : OVERVIEW_PARTIAL_CACHE_TTL_MS;
}

function throwFromSectionReason(reason: CustomApiSectionReason): never {
  switch (reason) {
    case "unauthorized":
      throw toIntegrationError(
        new CustomApiError("UNAUTHORIZED", "Custom API credentials are invalid"),
      );
    case "timeout":
      throw new IntegrationError("TIMEOUT", "Custom API request timed out");
    case "rate-limited":
      throw new IntegrationError("RATE_LIMITED", "Custom API rate limit exceeded");
    case "dns":
      throw new IntegrationError("DNS_ERROR", "Custom API request failed");
    case "tls":
      throw new IntegrationError("TLS_ERROR", "Custom API request failed");
    case "unreachable":
      throw new IntegrationError("UNREACHABLE", "Custom API request failed");
    case "permission-denied":
      throw new IntegrationError("FORBIDDEN", "Custom API access is forbidden");
    case "api-unavailable":
      throw new IntegrationError("NOT_FOUND", "Custom API endpoint was not found");
    case "invalid-response":
    case "unknown":
      throw new IntegrationError("INVALID_RESPONSE", "Custom API overview is unavailable");
    default: {
      const _exhaustive: never = reason;
      throw new IntegrationError("INVALID_RESPONSE", String(_exhaustive));
    }
  }
}

export async function fetchCustomApiOverview(
  ctx: CustomApiClientContext,
): Promise<CustomApiOverview> {
  const first = ctx.endpoints[0];
  if (!first) throw new IntegrationError("MISCONFIGURED", "Custom API endpoints are missing");
  let probe: CustomApiSection<CustomApiProbeDto>;
  try {
    await readJson(ctx, first.path);
    probe = { status: "available", data: { endpointKey: first.key, json: true } };
  } catch (error) {
    if (error instanceof CustomApiError || error instanceof IntegrationError)
      probe = sectionFromError<CustomApiProbeDto>(error);
    else throw error;
  }
  if (probe.status === "unavailable") throwFromSectionReason(probe.reason ?? "unknown");
  return {
    status: "available",
    fetchedAt: new Date().toISOString(),
    probe,
    endpoints: ctx.endpoints.map((endpoint) =>
      Object.freeze({ key: endpoint.key, label: endpoint.label }),
    ),
  };
}

export async function fetchCustomApiValue(
  ctx: CustomApiClientContext,
  endpointKey: string,
  jsonPath: string,
  display: CustomApiDisplayMode,
): Promise<CustomApiValueResult> {
  const endpoint = ctx.endpoints.find((item) => item.key === endpointKey);
  if (!endpoint) throw new IntegrationError("MISCONFIGURED", "Custom API endpoint key is unknown");
  try {
    const payload = await readJson(ctx, endpoint.path);
    const value = mapCustomApiValue(payload, jsonPath, display, ctx.secretValues);
    const status: CustomApiOverviewStatus = value.status === "available" ? "available" : "degraded";
    return {
      status,
      fetchedAt: new Date().toISOString(),
      endpointKey,
      value,
    };
  } catch (error) {
    if (error instanceof CustomApiError) {
      const reason = sectionReasonFromError(error);
      if (reason === "unauthorized" || reason === "permission-denied")
        throwFromSectionReason(reason);
      throw toIntegrationError(error);
    }
    throw error;
  }
}
