import { IntegrationError } from "@dashboard/integrations";
import type { SynologyRequestFn } from "./transport";
import { mapDsmErrorCode, SynologyError } from "./errors";
import { SYNOLOGY_DEVICE_NAME, SYNOLOGY_ENTRY_CGI, SYNOLOGY_SESSION_NAME } from "./policy";
import { dsmAuthDataSchema } from "./schemas";
import { parseEnvelope } from "./api-discovery";
import { synologyFetch } from "./transport";

export interface DsmSession {
  readonly sid: string;
  readonly synoToken: string | undefined;
  readonly authVersion: number;
  readonly did?: string;
}

export interface LoginInput {
  readonly account: string;
  readonly password: string;
  readonly authVersion: number;
  readonly deviceId?: string;
  readonly otpCode?: string;
  readonly enableDeviceToken?: boolean;
}

function formBody(fields: Readonly<Record<string, string>>): string {
  return new URLSearchParams(fields).toString();
}

export function buildLoginRequest(input: LoginInput): string {
  const fields: Record<string, string> = {
    api: "SYNO.API.Auth",
    version: String(input.authVersion),
    method: "login",
    account: input.account,
    passwd: input.password,
    session: SYNOLOGY_SESSION_NAME,
    format: "sid",
  };
  if (input.authVersion >= 6) fields.enable_syno_token = "yes";
  if (input.otpCode) fields.otp_code = input.otpCode;
  if (input.enableDeviceToken) {
    fields.enable_device_token = "yes";
    fields.device_name = SYNOLOGY_DEVICE_NAME;
  }
  if (input.deviceId) {
    fields.device_id = input.deviceId;
    fields.device_name = SYNOLOGY_DEVICE_NAME;
  }
  return formBody(fields);
}

export function buildLogoutRequest(authVersion: number): string {
  return formBody({
    api: "SYNO.API.Auth",
    version: String(authVersion),
    method: "logout",
    session: SYNOLOGY_SESSION_NAME,
  });
}

export function sessionHeaders(session: DsmSession): Record<string, string> {
  return {
    cookie: `id=${encodeURIComponent(session.sid)}`,
    ...(session.synoToken ? { SynoToken: session.synoToken } : {}),
  };
}

export async function login(
  request: SynologyRequestFn,
  ctx: { baseUrl: string; verifyTls: boolean; timeoutMs: number; trustedCaPem?: string },
  input: LoginInput,
): Promise<DsmSession> {
  const result = await synologyFetch(request, ctx, "POST", SYNOLOGY_ENTRY_CGI, {
    body: buildLoginRequest(input),
  });
  if (!result.ok) throw new SynologyError("INVALID_RESPONSE", "DSM login failed");
  if (result.status !== 200) throw new SynologyError("INVALID_RESPONSE", "DSM login failed");
  const envelope = parseEnvelope(result.body);
  if (!envelope.success) throw mapDsmErrorCode(envelope.code);
  const parsed = dsmAuthDataSchema.safeParse(envelope.data);
  if (!parsed.success) throw new SynologyError("INVALID_RESPONSE", "DSM login payload is invalid");
  const did = parsed.data.did ?? parsed.data.device_id;
  return {
    sid: parsed.data.sid,
    synoToken: parsed.data.synotoken ?? parsed.data.SynoToken,
    authVersion: input.authVersion,
    ...(did === undefined ? {} : { did }),
  };
}

export async function logout(
  request: SynologyRequestFn,
  ctx: { baseUrl: string; verifyTls: boolean; timeoutMs: number; trustedCaPem?: string },
  session: DsmSession,
): Promise<void> {
  try {
    await synologyFetch(request, ctx, "POST", SYNOLOGY_ENTRY_CGI, {
      body: buildLogoutRequest(session.authVersion),
      headers: sessionHeaders(session),
    });
  } catch (error) {
    if (error instanceof SynologyError || error instanceof IntegrationError) return;
    throw error;
  }
}
