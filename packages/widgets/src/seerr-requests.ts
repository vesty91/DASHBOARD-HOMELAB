import { z } from "zod";
import type { WidgetContract } from "./types";

export const seerrRequestsConfigSchema = z.object({
  integrationId: z.uuid(),
});

export type SeerrRequestsConfig = z.infer<typeof seerrRequestsConfigSchema>;

/** Registry-only placeholder so defaultConfig satisfies Zod. Never persist this id. */
export const SEERR_REQUESTS_UNSET_INTEGRATION_ID = "00000000-0000-4000-8000-000000000000";

export const seerrRequestsDefaultConfig: SeerrRequestsConfig = {
  integrationId: SEERR_REQUESTS_UNSET_INTEGRATION_ID,
};

export type SeerrRequestsDraftConfig = {
  integrationId: string;
};

export const seerrRequestsDraftConfig: SeerrRequestsDraftConfig = {
  integrationId: "",
};

export const seerrRequestsContract: WidgetContract<SeerrRequestsConfig> = {
  id: "seerr-requests",
  version: 1,
  name: "Demandes Seerr",
  description: "Version et compteurs de demandes Seerr en lecture seule.",
  category: "monitoring",
  defaultSize: { w: 3, h: 2 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 6, h: 4 },
  defaultConfig: seerrRequestsDefaultConfig,
  configSchema: seerrRequestsConfigSchema,
  publicSafe: false,
};

export type SeerrRequestsView =
  | {
      status: "ready";
      overviewStatus: "available" | "degraded";
      fetchedAt: string;
      version: string | null;
      pending: number | null;
      approved: number | null;
      processing: number | null;
      available: number | null;
    }
  | { status: "permission-denied" }
  | { status: "empty" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "configuration-missing" };
