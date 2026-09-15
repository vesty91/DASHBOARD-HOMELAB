import { z } from "zod";
import type { WidgetContract } from "./types";

export const CUSTOM_API_VALUE_UNSET_INTEGRATION_ID = "00000000-0000-4000-8000-000000000000";

const ENDPOINT_KEY = /^[a-z0-9][a-z0-9-]{0,31}$/u;
const JSON_PATH =
  /^[A-Za-z0-9_-]{1,64}(?:(?:\.[A-Za-z0-9_-]{1,64})|(?:\[(?:0|[1-9][0-9]{0,2})\])){0,7}$/u;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/u;

export const customApiValueConfigSchema = z.object({
  integrationId: z.uuid(),
  endpointKey: z.string().regex(ENDPOINT_KEY, "Endpoint key must be a lowercase slug"),
  jsonPath: z
    .string()
    .min(1)
    .max(128)
    .regex(JSON_PATH, "JSON path is invalid")
    .refine((value) => !CONTROL_CHARS.test(value), "JSON path must not contain control characters")
    .refine(
      (value) => !/(?:^|\.)(?:__proto__|prototype|constructor)(?:\.|$|\[)/iu.test(value),
      "JSON path must not use prototype keys",
    ),
  display: z.enum(["text", "number", "badge", "list"]),
  label: z
    .string()
    .max(48)
    .refine((value) => !CONTROL_CHARS.test(value), "Label must not contain control characters")
    .optional(),
  unit: z
    .string()
    .max(16)
    .refine((value) => !CONTROL_CHARS.test(value), "Unit must not contain control characters")
    .optional(),
});

export type CustomApiValueConfig = z.infer<typeof customApiValueConfigSchema>;

export const customApiValueDefaultConfig: CustomApiValueConfig = {
  integrationId: CUSTOM_API_VALUE_UNSET_INTEGRATION_ID,
  endpointKey: "status",
  jsonPath: "status",
  display: "text",
};

export type CustomApiValueDraftConfig = {
  integrationId: string;
  endpointKey: string;
  jsonPath: string;
  display: "text" | "number" | "badge" | "list";
  label?: string;
  unit?: string;
};

export const customApiValueDraftConfig: CustomApiValueDraftConfig = {
  integrationId: "",
  endpointKey: "status",
  jsonPath: "status",
  display: "text",
};

export const customApiValueContract: WidgetContract<CustomApiValueConfig> = {
  id: "custom-api-value",
  version: 1,
  name: "Valeur API",
  description: "Affiche une valeur JSON bornée extraite d'un endpoint allowlisté.",
  category: "monitoring",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 4 },
  defaultConfig: customApiValueDefaultConfig,
  configSchema: customApiValueConfigSchema,
  publicSafe: false,
};

export type CustomApiValueView =
  | {
      status: "ready";
      overviewStatus: "available" | "degraded";
      fetchedAt: string;
      label: string | null;
      unit: string | null;
      display: "text" | "number" | "badge" | "list";
      text: string | null;
      number: number | null;
      badgeLabel: string | null;
      badgeTone: "neutral" | "success" | "warning" | "danger" | null;
      listItems: readonly string[] | null;
      listTruncated: boolean;
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
