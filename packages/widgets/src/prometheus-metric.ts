import { z } from "zod";
import type { WidgetContract } from "./types";

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/u;

export const PROMETHEUS_METRIC_UNSET_INTEGRATION_ID = "00000000-0000-4000-8000-000000000000";
export const PROMETHEUS_METRIC_DEFAULT_RANGE_SECONDS = 900;
export const PROMETHEUS_METRIC_DEFAULT_STEP_SECONDS = 60;

export const prometheusMetricConfigSchema = z
  .object({
    integrationId: z.uuid(),
    query: z
      .string()
      .min(1)
      .max(512)
      .refine(
        (value) => !CONTROL_CHARS.test(value),
        "Prometheus query must not contain control characters",
      )
      .refine((value) => !/[\n\r]/u.test(value), "Prometheus query must not contain newlines"),
    mode: z.enum(["instant", "range"]),
    rangeSeconds: z
      .number()
      .int()
      .min(60)
      .max(21_600)
      .default(PROMETHEUS_METRIC_DEFAULT_RANGE_SECONDS),
    stepSeconds: z
      .number()
      .int()
      .min(15)
      .max(3_600)
      .default(PROMETHEUS_METRIC_DEFAULT_STEP_SECONDS),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "range" && data.rangeSeconds / data.stepSeconds > 200) {
      ctx.addIssue({
        code: "custom",
        path: ["stepSeconds"],
        message: "Prometheus range sample count exceeds 200",
      });
    }
  });

export type PrometheusMetricConfig = z.infer<typeof prometheusMetricConfigSchema>;

export const prometheusMetricDefaultConfig: PrometheusMetricConfig = {
  integrationId: PROMETHEUS_METRIC_UNSET_INTEGRATION_ID,
  query: "up",
  mode: "instant",
  rangeSeconds: PROMETHEUS_METRIC_DEFAULT_RANGE_SECONDS,
  stepSeconds: PROMETHEUS_METRIC_DEFAULT_STEP_SECONDS,
};

export type PrometheusMetricDraftConfig = {
  integrationId: string;
  query: string;
  mode: "instant" | "range";
  rangeSeconds: number;
  stepSeconds: number;
};

export const prometheusMetricDraftConfig: PrometheusMetricDraftConfig = {
  integrationId: "",
  query: "up",
  mode: "instant",
  rangeSeconds: PROMETHEUS_METRIC_DEFAULT_RANGE_SECONDS,
  stepSeconds: PROMETHEUS_METRIC_DEFAULT_STEP_SECONDS,
};

export const prometheusMetricContract: WidgetContract<PrometheusMetricConfig> = {
  id: "prometheus-metric",
  version: 1,
  name: "Métrique Prometheus",
  description: "Affiche une requête PromQL bornée (instantanée ou plage) via Prometheus.",
  category: "monitoring",
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 4 },
  defaultConfig: prometheusMetricDefaultConfig,
  configSchema: prometheusMetricConfigSchema,
  publicSafe: false,
};

export type PrometheusMetricView =
  | {
      status: "ready";
      resultType: "vector" | "matrix";
      queryName: string;
      lastValue: number | null;
      seriesCount: number;
      truncated: boolean;
      overviewStatus: "available" | "degraded";
      fetchedAt: string;
      sparkline: readonly number[];
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
