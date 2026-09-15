import {
  createSafeAutomationDispatcher,
  type AutomationActionDispatcher,
  type AutomationOwnerRecord,
} from "@dashboard/automations";
import type { EventBus } from "@dashboard/events";
import type { IntegrationStore } from "@dashboard/integrations";
import { createWorkerActionExecutor, type AutomationAuditSink } from "./actions";
import { createWorkerActionServices } from "./action-services";

export function createProductionAutomationDispatcher(input: {
  loadOwner: (userId: string) => Promise<AutomationOwnerRecord | null>;
  integrationStore: IntegrationStore;
  bus: EventBus;
  audit: AutomationAuditSink;
  secretEncryptionKey?: string;
}): AutomationActionDispatcher {
  return createSafeAutomationDispatcher({
    loadOwner: input.loadOwner,
    executor: createWorkerActionExecutor({
      services: createWorkerActionServices({
        store: input.integrationStore,
        bus: input.bus,
        ...(input.secretEncryptionKey ? { secretEncryptionKey: input.secretEncryptionKey } : {}),
      }),
      audit: input.audit,
    }),
  });
}
