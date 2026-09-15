import { TRPCError } from "@trpc/server";
import type { BoardSnapshot } from "@dashboard/boards";
import type { CustomApiValueResult } from "@dashboard/custom-api";
import {
  CUSTOM_API_VALUE_UNSET_INTEGRATION_ID,
  customApiValueConfigSchema,
  type CustomApiValueView,
} from "@dashboard/widgets";

export interface CustomApiBoardCaller {
  customApi: {
    value: {
      get: (input: {
        integrationId: string;
        endpointKey: string;
        jsonPath: string;
        display: "text" | "number" | "badge" | "list";
      }) => Promise<CustomApiValueResult>;
    };
  };
}

function toView(
  dto: CustomApiValueResult,
  config: {
    display: "text" | "number" | "badge" | "list";
    label?: string | undefined;
    unit?: string | undefined;
  },
): Extract<CustomApiValueView, { status: "ready" }> {
  const value = dto.value.data;
  return {
    status: "ready",
    overviewStatus: dto.status,
    fetchedAt: dto.fetchedAt,
    label: config.label ?? null,
    unit: config.unit ?? null,
    display: value?.display ?? config.display,
    text: value?.display === "text" ? value.text : null,
    number: value?.display === "number" ? value.number : null,
    badgeLabel: value?.display === "badge" ? value.label : null,
    badgeTone: value?.display === "badge" ? value.tone : null,
    listItems: value?.display === "list" ? value.items : null,
    listTruncated: value?.display === "list" ? value.truncated : false,
  };
}

export async function resolveCustomApiValueViews(
  snapshot: BoardSnapshot,
  caller: CustomApiBoardCaller,
): Promise<Record<string, CustomApiValueView>> {
  const views: Record<string, CustomApiValueView> = {};
  for (const item of snapshot.items) {
    if (item.widgetType !== "custom-api-value" || item.runtimeStatus !== "ready") continue;
    const parsed = customApiValueConfigSchema.safeParse(item.config);
    if (!parsed.success || parsed.data.integrationId === CUSTOM_API_VALUE_UNSET_INTEGRATION_ID) {
      views[item.id] = { status: "configuration-missing" };
      continue;
    }
    try {
      const dto = await caller.customApi.value.get({
        integrationId: parsed.data.integrationId,
        endpointKey: parsed.data.endpointKey,
        jsonPath: parsed.data.jsonPath,
        display: parsed.data.display,
      });
      views[item.id] = toView(dto, parsed.data);
    } catch (error) {
      if (error instanceof TRPCError && error.code === "NOT_FOUND")
        views[item.id] = { status: "empty" };
      else if (
        error instanceof TRPCError &&
        (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
      )
        views[item.id] = { status: "permission-denied" };
      else views[item.id] = { status: "error" };
    }
  }
  return views;
}
