import { evaluateAutomationOwner, type AutomationOwnerRecord } from "./access";
import { getAutomationActionPolicy } from "./action-registry";
import type {
  AutomationActionDispatcher,
  AutomationDispatchInput,
  AutomationDispatchResult,
} from "./dispatcher";
import { AutomationError } from "./errors";

export interface AutomationDispatchInputWithOwner extends AutomationDispatchInput {
  ownerUserId: string | null;
}

export interface SafeAutomationActionExecutor {
  execute(input: {
    owner: AutomationOwnerRecord;
    dispatch: AutomationDispatchInputWithOwner;
  }): Promise<AutomationDispatchResult>;
}

function failureCode(error: unknown): string {
  if (error instanceof AutomationError) return error.code;
  if (typeof error === "object" && error && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string" && /^[A-Z][A-Z0-9_]{1,63}$/u.test(code)) return code;
  }
  return "INTERNAL_ERROR";
}

function mapFailure(error: unknown): AutomationDispatchResult {
  const errorCode = failureCode(error);
  switch (errorCode) {
    case "FORBIDDEN":
    case "UNAUTHORIZED":
    case "DENIED_PERMISSION":
    case "DENIED_OWNER_MISSING":
    case "DENIED_OWNER_DISABLED":
      return { status: "denied", errorCode };
    case "RATE_LIMITED":
      return { status: "skipped", errorCode: "RATE_LIMITED" };
    case "CONFLICT":
      return { status: "skipped", errorCode: "STALE_REVISION" };
    case "NOT_FOUND":
    case "MISCONFIGURED":
    case "SECRETS_NOT_CONFIGURED":
      return { status: "skipped", errorCode };
    default:
      return { status: "failed", errorCode };
  }
}

export function createSafeAutomationDispatcher(options: {
  loadOwner: (userId: string) => Promise<AutomationOwnerRecord | null>;
  executor: SafeAutomationActionExecutor;
}): AutomationActionDispatcher {
  return {
    async dispatch(input) {
      const policy = getAutomationActionPolicy(input.actionType);
      if (!policy.automationAllowed) return { status: "denied", errorCode: "MANUAL_ONLY" };
      const ownerId = input.ownerUserId ?? null;
      let owner: AutomationOwnerRecord | null = null;
      try {
        owner = ownerId ? await options.loadOwner(ownerId) : null;
        evaluateAutomationOwner(owner, "run");
      } catch (error) {
        return mapFailure(error);
      }
      if (!owner) return { status: "denied", errorCode: "DENIED_OWNER_MISSING" };
      try {
        return await options.executor.execute({
          owner,
          dispatch: {
            ...input,
            ownerUserId: owner.id,
          },
        });
      } catch (error) {
        return mapFailure(error);
      }
    },
  };
}

export function automationActionAuditMetadata(input: {
  automationId: string;
  runId: string;
  actionType: string;
  integrationId: string;
  resourceId: string;
  result: "success" | "accepted" | "failed" | "denied";
}): Record<string, unknown> {
  return {
    source: "automation",
    automationId: input.automationId,
    runId: input.runId,
    action: input.actionType,
    integrationId: input.integrationId,
    resourceId: input.resourceId,
    result: input.result,
  };
}
