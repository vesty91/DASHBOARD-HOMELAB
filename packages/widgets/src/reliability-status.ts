import { z } from "zod";
import type { WidgetContract } from "./types";

export const RELIABILITY_STATUS_WINDOW_DAYS = [7, 30, 90] as const;
export type ReliabilityStatusWindowDays = (typeof RELIABILITY_STATUS_WINDOW_DAYS)[number];

export const RELIABILITY_STATUS_UNSET_SERVICE_KEY = "00000000-0000-4000-8000-000000000000";

export const reliabilityStatusConfigSchema = z.object({
  serviceKey: z.uuid(),
  windowDays: z.union([z.literal(7), z.literal(30), z.literal(90)]).default(30),
  showSparkline: z.boolean().default(true),
});

export type ReliabilityStatusConfig = z.infer<typeof reliabilityStatusConfigSchema>;

export const reliabilityStatusDefaultConfig: ReliabilityStatusConfig = {
  serviceKey: RELIABILITY_STATUS_UNSET_SERVICE_KEY,
  windowDays: 30,
  showSparkline: true,
};

export type ReliabilityStatusDraftConfig = {
  serviceKey: string;
  windowDays: ReliabilityStatusWindowDays;
  showSparkline: boolean;
};

export const reliabilityStatusDraftConfig: ReliabilityStatusDraftConfig = {
  serviceKey: "",
  windowDays: 30,
  showSparkline: true,
};

export const reliabilityStatusContract: WidgetContract<ReliabilityStatusConfig> = {
  id: "reliability-status",
  version: 1,
  name: "Fiabilité SLO",
  description: "Disponibilité quotidienne et budget d’erreur SLO pour une intégration.",
  category: "monitoring",
  defaultSize: { w: 3, h: 3 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 4 },
  defaultConfig: reliabilityStatusDefaultConfig,
  configSchema: reliabilityStatusConfigSchema,
  publicSafe: false,
};

export type ReliabilityStatusView =
  | {
      status: "ready";
      serviceKey: string;
      serviceName: string;
      windowDays: ReliabilityStatusWindowDays;
      fromDateUtc: string;
      toDateUtc: string;
      availabilityBasisPoints: number | null;
      sloMet: boolean | null;
      sloName: string | null;
      objectiveBasisPoints: number | null;
      remainingBudgetBasisPoints: number | null;
      sparkline: readonly number[];
      fetchedAt: string;
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
