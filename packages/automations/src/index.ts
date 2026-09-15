export { AutomationError, AUTOMATION_ERROR_CODES, type AutomationErrorCode } from "./errors";
export {
  AUTOMATION_ACTION_SQL_IN,
  AUTOMATION_ACTION_TYPES,
  AUTOMATION_CONFIG_MAX_BYTES,
  AUTOMATION_COOLDOWN_MAX_SECONDS,
  AUTOMATION_COOLDOWN_MIN_SECONDS,
  AUTOMATION_DESCRIPTION_MAX,
  AUTOMATION_NAME_MAX,
  AUTOMATION_RUN_MAX_PER_RULE,
  AUTOMATION_RUN_RETENTION_MS,
  AUTOMATION_RUN_STATUS_SQL_IN,
  AUTOMATION_RUN_STATUSES,
  AUTOMATION_SUMMARY_MAX_BYTES,
  AUTOMATION_TRIGGER_SQL_IN,
  AUTOMATION_TRIGGER_TYPES,
  type AutomationActionType,
  type AutomationRunStatus,
  type AutomationTriggerType,
} from "./types";
export {
  automationEnabledUpdateSchema,
  automationRuleCreateSchema,
  automationRuleUpdateSchema,
  automationRunCreateSchema,
  parseAutomationEnabledUpdate,
  parseAutomationRuleCreate,
  parseAutomationRuleUpdate,
  parseAutomationRunCreate,
  type AutomationEnabledUpdateInput,
  type AutomationRuleCreateInput,
  type AutomationRuleUpdateInput,
  type AutomationRunCreateInput,
} from "./schemas";
export {
  evaluateAutomationOwner,
  type AutomationAccessKind,
  type AutomationOwnerRecord,
} from "./access";
export { assertSafeAutomationJson, assertSafeOptionalAutomationJson } from "./json";
export {
  AUTOMATION_EVENT_TYPES,
  AUTOMATION_MAX_INTERVAL_MINUTES,
  AUTOMATION_MIN_INTERVAL_MINUTES,
  AUTOMATION_STATUS_VALUES,
  nextScheduleRunAt,
  parseTriggerConfig,
  type AutomationEventType,
  type ParsedTriggerConfig,
  type ScheduleTriggerConfig,
} from "./triggers";
export {
  CONDITION_COMPARE_OPS,
  CONDITION_FIELDS,
  CONDITION_LOGIC_OPS,
  CONDITION_MAX_DEPTH,
  CONDITION_MAX_NODES,
  evaluateCondition,
  parseConditionConfig,
  type ConditionNode,
} from "./conditions";
export {
  evaluateAutomationTrigger,
  parseAutomationTriggerAndCondition,
  type TriggerEvaluation,
  type TriggerSkipReason,
} from "./evaluate";
export { buildEventRunKey, buildScheduleRunKey } from "./run-key";
export {
  unwiredAutomationDispatcher,
  type AutomationActionDispatcher,
  type AutomationDispatchInput,
  type AutomationDispatchResult,
  type AutomationDispatchStatus,
} from "./dispatcher";
export {
  AUTOMATION_LEASE_MS,
  AUTOMATION_SCHEDULER_MAX_ACTIONS_PER_MINUTE,
  AUTOMATION_SCHEDULER_MAX_IN_FLIGHT,
  AUTOMATION_SCHEDULER_SCAN_LIMIT,
  AutomationScheduler,
  createAutomationScheduler,
  skipReasonErrorCode,
  type AutomationEventIngestStatus,
  type AutomationRuleSnapshot,
  type AutomationRunInsertInput,
  type AutomationRunSnapshot,
  type AutomationRuntimeSnapshot,
  type AutomationSchedulerHealth,
  type AutomationSchedulerHealthStatus,
  type AutomationSchedulerOptions,
  type AutomationSchedulerStore,
} from "./scheduler";
