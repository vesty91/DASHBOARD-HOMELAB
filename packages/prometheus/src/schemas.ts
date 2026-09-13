import { z } from "zod";
import {
  DEFAULT_TIMEOUT_MS,
  IntegrationError,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  normalizeTrustedCaPem,
} from "@dashboard/integrations";
import type { PrometheusValidatedQuery } from "./types";

export const PROMETHEUS_QUERY_MIN_LENGTH = 1;
export const PROMETHEUS_QUERY_MAX_LENGTH = 512;
export const PROMETHEUS_RANGE_SECONDS_MIN = 60;
export const PROMETHEUS_RANGE_SECONDS_MAX = 21_600;
export const PROMETHEUS_STEP_SECONDS_MIN = 15;
export const PROMETHEUS_STEP_SECONDS_MAX = 3_600;
export const PROMETHEUS_MAX_WINDOW_SAMPLES = 200;
export const PROMETHEUS_TIMEOUT_SECONDS_MIN = 1;
export const PROMETHEUS_TIMEOUT_SECONDS_MAX = 8;
export const PROMETHEUS_SERIES_DTO_MAX = 20;
export const PROMETHEUS_SERIES_RAW_REJECT = 50;
export const PROMETHEUS_SAMPLES_MAX = 2_000;
export const PROMETHEUS_OVERVIEW_QUERY = "up";
export const PROMETHEUS_DEFAULT_RANGE_SECONDS = 900;
export const PROMETHEUS_DEFAULT_STEP_SECONDS = 60;

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/u;

export const visibleAscii = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !/[^\u0021-\u007E]/u.test(value), "Prometheus secret must be visible ASCII");

export const prometheusQueryStringSchema = z
  .string()
  .min(PROMETHEUS_QUERY_MIN_LENGTH)
  .max(PROMETHEUS_QUERY_MAX_LENGTH)
  .refine(
    (value) => !CONTROL_CHARS.test(value),
    "Prometheus query must not contain control characters",
  )
  .refine((value) => !/[\n\r]/u.test(value), "Prometheus query must not contain newlines");

export const prometheusConfigSchema = z
  .object({
    verifyTls: z.boolean().default(true),
    timeoutMs: z.number().int().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
    trustedCaPem: z.string().optional(),
  })
  .superRefine((data, ctx) => {
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
      ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
    };
  });

export const prometheusSecretSchema = z.object({
  bearerToken: visibleAscii.optional(),
});

export const prometheusIntegrationInputSchema = z.object({
  integrationId: z.uuid(),
});

const rangeBoundsSchema = z.object({
  rangeSeconds: z
    .number()
    .int()
    .min(PROMETHEUS_RANGE_SECONDS_MIN)
    .max(PROMETHEUS_RANGE_SECONDS_MAX)
    .default(PROMETHEUS_DEFAULT_RANGE_SECONDS),
  stepSeconds: z
    .number()
    .int()
    .min(PROMETHEUS_STEP_SECONDS_MIN)
    .max(PROMETHEUS_STEP_SECONDS_MAX)
    .default(PROMETHEUS_DEFAULT_STEP_SECONDS),
});

function refineWindowSamples(
  rangeSeconds: number,
  stepSeconds: number,
  ctx: z.RefinementCtx,
  path: readonly (string | number)[] = ["stepSeconds"],
): void {
  if (rangeSeconds / stepSeconds > PROMETHEUS_MAX_WINDOW_SAMPLES) {
    ctx.addIssue({
      code: "custom",
      path: [...path],
      message: "Prometheus range sample count exceeds 200",
    });
  }
}

export const prometheusInstantQueryInputSchema = prometheusIntegrationInputSchema.extend({
  query: prometheusQueryStringSchema,
});

export const prometheusRangeQueryInputSchema = prometheusIntegrationInputSchema
  .extend({
    query: prometheusQueryStringSchema,
  })
  .extend(rangeBoundsSchema.shape)
  .superRefine((data, ctx) => {
    refineWindowSamples(data.rangeSeconds, data.stepSeconds, ctx);
  });

export const prometheusWidgetQuerySchema = z
  .object({
    integrationId: z.uuid(),
    query: prometheusQueryStringSchema,
    mode: z.enum(["instant", "range"]),
    rangeSeconds: z
      .number()
      .int()
      .min(PROMETHEUS_RANGE_SECONDS_MIN)
      .max(PROMETHEUS_RANGE_SECONDS_MAX)
      .default(PROMETHEUS_DEFAULT_RANGE_SECONDS),
    stepSeconds: z
      .number()
      .int()
      .min(PROMETHEUS_STEP_SECONDS_MIN)
      .max(PROMETHEUS_STEP_SECONDS_MAX)
      .default(PROMETHEUS_DEFAULT_STEP_SECONDS),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "range") refineWindowSamples(data.rangeSeconds, data.stepSeconds, ctx);
  });

export type PrometheusConfig = z.infer<typeof prometheusConfigSchema>;
export type PrometheusSecrets = z.infer<typeof prometheusSecretSchema>;
export type PrometheusInstantQueryInput = z.infer<typeof prometheusInstantQueryInputSchema>;
export type PrometheusRangeQueryInput = z.infer<typeof prometheusRangeQueryInputSchema>;
export type PrometheusWidgetQuery = z.infer<typeof prometheusWidgetQuerySchema>;

function validationError(message: string): never {
  throw new IntegrationError("VALIDATION_ERROR", message);
}

export function assertPrometheusQueryString(query: string): string {
  const parsed = prometheusQueryStringSchema.safeParse(query);
  if (!parsed.success) validationError("Prometheus query is invalid");
  return parsed.data;
}

export function parsePrometheusInstantQuery(input: unknown): PrometheusValidatedQuery {
  const parsed = prometheusInstantQueryInputSchema.safeParse(input);
  if (!parsed.success) validationError("Prometheus instant query is invalid");
  return { mode: "instant", query: parsed.data.query };
}

export function parsePrometheusRangeQuery(input: unknown): PrometheusValidatedQuery {
  const parsed = prometheusRangeQueryInputSchema.safeParse(input);
  if (!parsed.success) validationError("Prometheus range query is invalid");
  return {
    mode: "range",
    query: parsed.data.query,
    rangeSeconds: parsed.data.rangeSeconds,
    stepSeconds: parsed.data.stepSeconds,
  };
}

export function prometheusTimeoutSeconds(timeoutMs: number): number {
  const seconds = Math.round(timeoutMs / 1000);
  return Math.min(
    PROMETHEUS_TIMEOUT_SECONDS_MAX,
    Math.max(PROMETHEUS_TIMEOUT_SECONDS_MIN, Number.isFinite(seconds) ? seconds : 8),
  );
}
