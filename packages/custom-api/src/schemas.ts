import { z } from "zod";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  normalizeTrustedCaPem,
} from "@dashboard/integrations";
import { parseJsonPath } from "./json-path";

export const CUSTOM_API_ENDPOINT_MAX = 8;
export const CUSTOM_API_PATH_MAX_LENGTH = 256;
export const CUSTOM_API_LABEL_MAX_LENGTH = 48;

export const CUSTOM_API_KEY_HEADERS = [
  "X-Api-Key",
  "X-API-Key",
  "X-Auth-Token",
  "X-Token",
] as const;
export type CustomApiKeyHeader = (typeof CUSTOM_API_KEY_HEADERS)[number];

const FORBIDDEN_API_KEY_HEADERS = new Set(["authorization", "cookie", "host"]);

export const customApiVisibleAsciiSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !/[^\u0021-\u007E]/u.test(value), "Value must be visible ASCII");

export const customApiEndpointKeySchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,31}$/u, "Endpoint key must be a lowercase slug");

export const customApiJsonPathSchema = z
  .string()
  .min(1)
  .max(128)
  .superRefine((value, ctx) => {
    try {
      parseJsonPath(value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "JSON path is invalid",
      });
    }
  });

export const CUSTOM_API_DISPLAY_MODES = ["text", "number", "badge", "list"] as const;

export const customApiDisplayModeSchema = z.enum(CUSTOM_API_DISPLAY_MODES);

function isVisibleAsciiLabel(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= CUSTOM_API_LABEL_MAX_LENGTH &&
    !/[^\u0020-\u007E]/u.test(value)
  );
}

export const customApiEndpointPathSchema = z
  .string()
  .min(1)
  .max(CUSTOM_API_PATH_MAX_LENGTH)
  .refine((value) => value.startsWith("/"), "Endpoint path must be an absolute pathname")
  .refine((value) => !/[^\u0021-\u007E]/u.test(value), "Endpoint path must be visible ASCII")
  .refine(
    (value) => !/[\s?#@:]/u.test(value),
    "Endpoint path must not include query, fragment, credentials or scheme",
  )
  .refine((value) => !value.includes("\\"), "Endpoint path backslash is not allowed")
  .refine((value) => !value.includes(".."), "Endpoint path traversal is not allowed")
  .refine((value) => !value.includes("//"), "Endpoint path must not contain empty segments");

export const customApiEndpointSchema = z.object({
  key: customApiEndpointKeySchema,
  label: z
    .string()
    .min(1)
    .max(CUSTOM_API_LABEL_MAX_LENGTH)
    .refine(isVisibleAsciiLabel, "Endpoint label must be visible ASCII"),
  path: customApiEndpointPathSchema,
});

export const customApiApiKeyHeaderSchema = z
  .string()
  .refine((value) => (CUSTOM_API_KEY_HEADERS as readonly string[]).includes(value), {
    message: "API key header is not allowed",
  })
  .refine((value) => !FORBIDDEN_API_KEY_HEADERS.has(value.toLocaleLowerCase("und")), {
    message: "API key header is not allowed",
  })
  .transform((value) => value as CustomApiKeyHeader);

export const customApiConfigSchema = z
  .object({
    verifyTls: z.boolean().default(true),
    timeoutMs: z.number().int().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
    trustedCaPem: z.string().optional(),
    apiKeyHeader: customApiApiKeyHeaderSchema.optional(),
    endpoints: z.array(customApiEndpointSchema).min(1).max(CUSTOM_API_ENDPOINT_MAX),
  })
  .superRefine((data, ctx) => {
    const keys = new Set<string>();
    data.endpoints.forEach((endpoint, index) => {
      if (keys.has(endpoint.key)) {
        ctx.addIssue({
          code: "custom",
          path: ["endpoints", index, "key"],
          message: "Endpoint keys must be unique",
        });
      }
      keys.add(endpoint.key);
    });
    if (data.trustedCaPem === undefined || data.trustedCaPem.trim() === "") return;
    try {
      normalizeTrustedCaPem(data.trustedCaPem);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        path: ["trustedCaPem"],
        message: error instanceof Error ? error.message : "Invalid trusted CA PEM",
      });
      return;
    }
    if (data.verifyTls === false) {
      ctx.addIssue({
        code: "custom",
        path: ["trustedCaPem"],
        message: "trustedCaPem cannot be set when verifyTls is false",
      });
    }
  })
  .transform((data) => {
    const trustedCaPem =
      data.trustedCaPem === undefined || data.trustedCaPem.trim() === ""
        ? undefined
        : normalizeTrustedCaPem(data.trustedCaPem);
    return {
      verifyTls: data.verifyTls,
      timeoutMs: data.timeoutMs,
      endpoints: data.endpoints,
      ...(data.apiKeyHeader === undefined ? {} : { apiKeyHeader: data.apiKeyHeader }),
      ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
    };
  });

export const customApiSecretSchema = z.object({
  bearerToken: customApiVisibleAsciiSchema.optional(),
  apiKey: customApiVisibleAsciiSchema.optional(),
});

export const customApiIntegrationInputSchema = z.object({
  integrationId: z.uuid(),
});

export const customApiValueInputSchema = z.object({
  integrationId: z.uuid(),
  endpointKey: customApiEndpointKeySchema,
  jsonPath: customApiJsonPathSchema,
  display: customApiDisplayModeSchema,
});

export type CustomApiConfig = z.infer<typeof customApiConfigSchema>;
export type CustomApiSecrets = z.infer<typeof customApiSecretSchema>;
export type CustomApiValueInput = z.infer<typeof customApiValueInputSchema>;
export type CustomApiEndpoint = z.infer<typeof customApiEndpointSchema>;
