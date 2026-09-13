import { IntegrationError, type IntegrationClientContext } from "@dashboard/integrations";
import { assembleHostsDto, mapHostsPage, parseAuthToken, parseJsonObject } from "./dto";
import { BeszelError } from "./errors";
import { BESZEL_AUTH_PATH, BESZEL_SYSTEMS_PATH } from "./policy";
import type { BeszelConfig, BeszelSecrets } from "./schemas";
import {
  BESZEL_JSON_MAX_BYTES,
  beszelAuthHeaders,
  beszelFetch,
  type BeszelRequestFn,
  type BeszelTransportContext,
} from "./transport";
import type { BeszelHostDto, BeszelOverview, BeszelOverviewStatus } from "./types";

export const OVERVIEW_CACHE_TTL_MS = 15_000;
export const OVERVIEW_PARTIAL_CACHE_TTL_MS = 8_000;
export const BESZEL_OVERVIEW_FAILURE_TTL_MS = 15_000;
export const BESZEL_SYSTEMS_PER_PAGE = 50;
export const BESZEL_SYSTEMS_MAX_PAGES = 100;

export interface BeszelClientContext extends BeszelTransportContext {
  readonly request: BeszelRequestFn;
  readonly identity: string;
  readonly password: string;
  readonly secretValues: readonly string[];
}

export function beszelContextFromIntegration(
  ctx: IntegrationClientContext<BeszelConfig, BeszelSecrets> & { secretValues?: readonly string[] },
): BeszelClientContext {
  const trustedCaPem =
    typeof ctx.config.trustedCaPem === "string" ? ctx.config.trustedCaPem : undefined;
  return {
    baseUrl: ctx.baseUrl,
    verifyTls: ctx.verifyTls,
    timeoutMs: ctx.timeoutMs,
    identity: ctx.config.identity,
    password: ctx.secrets.password,
    request: ctx.request,
    secretValues: ctx.secretValues ?? [ctx.secrets.password, ctx.config.identity],
    ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
  };
}

async function authenticate(ctx: BeszelClientContext): Promise<string> {
  const result = await beszelFetch(ctx.request, ctx, "POST", BESZEL_AUTH_PATH, {
    maxBodyBytes: 16 * 1024,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identity: ctx.identity, password: ctx.password }),
  });
  return parseAuthToken(parseJsonObject(result.body));
}

async function fetchSystemsPage(
  ctx: BeszelClientContext,
  token: string,
  page: number,
): Promise<{ hosts: BeszelHostDto[]; page: number; perPage: number; totalPages: number | null }> {
  const result = await beszelFetch(ctx.request, ctx, "GET", BESZEL_SYSTEMS_PATH, {
    maxBodyBytes: BESZEL_JSON_MAX_BYTES,
    headers: { ...beszelAuthHeaders(token) },
    search: {
      page: String(page),
      perPage: String(BESZEL_SYSTEMS_PER_PAGE),
      fields: "id,name,host,status,info,updated",
      skipTotal: "false",
    },
  });
  return mapHostsPage(
    parseJsonObject(result.body),
    page,
    BESZEL_SYSTEMS_PER_PAGE,
    ctx.secretValues,
  );
}

export async function fetchBeszelHosts(
  ctx: BeszelClientContext,
): Promise<{ hosts: BeszelHostDto[]; truncated: boolean }> {
  const token = await authenticate(ctx);
  const hosts: BeszelHostDto[] = [];
  let truncated = false;
  for (let page = 1; page <= BESZEL_SYSTEMS_MAX_PAGES; page += 1) {
    const mapped = await fetchSystemsPage(ctx, token, page);
    hosts.push(...mapped.hosts);
    if (mapped.totalPages !== null && mapped.totalPages < mapped.page)
      throw new IntegrationError("INVALID_RESPONSE", "Beszel totalPages is inconsistent");
    const lastPage =
      mapped.hosts.length < mapped.perPage ||
      (mapped.totalPages !== null && mapped.page >= mapped.totalPages);
    if (lastPage) return { hosts, truncated };
    if (page === BESZEL_SYSTEMS_MAX_PAGES) truncated = true;
  }
  return { hosts, truncated };
}

export async function testBeszelConnection(
  ctx: BeszelClientContext,
): Promise<{ hostCount: number }> {
  const { hosts } = await fetchBeszelHosts(ctx);
  return { hostCount: hosts.length };
}

export function overviewCacheTtl(overview: BeszelOverview): number {
  return overview.status === "available" ? OVERVIEW_CACHE_TTL_MS : OVERVIEW_PARTIAL_CACHE_TTL_MS;
}

export async function fetchBeszelOverview(ctx: BeszelClientContext): Promise<BeszelOverview> {
  const loaded = await fetchBeszelHosts(ctx);
  const data = assembleHostsDto(loaded.hosts, loaded.truncated);
  const unhealthy = data.downCount > 0 || data.pendingCount > 0;
  const status: BeszelOverviewStatus = unhealthy || data.truncated ? "degraded" : "available";
  return {
    status,
    fetchedAt: new Date().toISOString(),
    hosts: { status: "available", data },
  };
}

export function throwIfAuthFailed(error: unknown): never {
  if (error instanceof BeszelError) throw error;
  throw error;
}
