import type { AutomationActionType, AutomationRunStatus, AutomationTriggerType } from "./types";

export type AutomationDispatchStatus = Extract<
  AutomationRunStatus,
  "succeeded" | "failed" | "denied" | "skipped" | "unknown"
>;

export interface AutomationDispatchResult {
  status: AutomationDispatchStatus;
  errorCode?: string | null;
  resourceId?: string | null;
  summaryJson?: Record<string, unknown> | null;
}

export interface AutomationDispatchInput {
  runId: string;
  automationId: string;
  actionType: AutomationActionType;
  actionConfigJson: Record<string, unknown>;
  triggerType: AutomationTriggerType;
}

export interface AutomationActionDispatcher {
  dispatch(input: AutomationDispatchInput): Promise<AutomationDispatchResult>;
}

export function unwiredAutomationDispatcher(): AutomationActionDispatcher {
  return {
    async dispatch() {
      return { status: "skipped", errorCode: "ACTION_NOT_WIRED" };
    },
  };
}
