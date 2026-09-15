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
