import { z } from "zod";
import { AutomationError } from "./errors";
import { type AutomationEventType, type ParsedTriggerConfig } from "./triggers";

export const CONDITION_COMPARE_OPS = ["eq", "neq", "lt", "lte", "gt", "gte", "contains"] as const;
export const CONDITION_LOGIC_OPS = ["and", "or"] as const;
export type ConditionCompareOp = (typeof CONDITION_COMPARE_OPS)[number];
export type ConditionLogicOp = (typeof CONDITION_LOGIC_OPS)[number];

export const CONDITION_MAX_DEPTH = 4;
export const CONDITION_MAX_NODES = 16;
export const CONDITION_MAX_STRING = 256;

export const CONDITION_FIELDS = [
  "status",
  "previousStatus",
  "integrationType",
  "integrationId",
  "errorCode",
  "jobType",
  "serviceKey",
  "sloId",
  "burnState",
  "window",
  "impactStatus",
] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export type ConditionValue = string | number | boolean;

export type CompareCondition = {
  op: ConditionCompareOp;
  field: ConditionField;
  value: ConditionValue;
};

export type LogicCondition = {
  op: ConditionLogicOp;
  nodes: ConditionNode[];
};

export type ConditionNode = CompareCondition | LogicCondition;

const compareValueSchema = z.union([
  z.string().min(1).max(CONDITION_MAX_STRING),
  z.number().finite(),
  z.boolean(),
]);

const compareSchema = z
  .object({
    op: z.enum(CONDITION_COMPARE_OPS),
    field: z.enum(CONDITION_FIELDS),
    value: compareValueSchema,
  })
  .strict();

type FieldType = "string" | "number";

const FIELD_TYPES: Record<ConditionField, FieldType> = {
  status: "string",
  previousStatus: "string",
  integrationType: "string",
  integrationId: "string",
  errorCode: "string",
  jobType: "string",
  serviceKey: "string",
  sloId: "string",
  burnState: "string",
  window: "string",
  impactStatus: "string",
};

const EVENT_FIELDS: Record<AutomationEventType, readonly ConditionField[]> = {
  "integration.status.changed": ["status", "integrationType", "integrationId"],
  "integration.data.changed": ["integrationType", "integrationId"],
  "job.failed": ["errorCode", "jobType"],
  "slo.burn-rate.changed": ["serviceKey", "sloId", "burnState", "window"],
  "dependency.impact.changed": ["serviceKey", "impactStatus"],
};

const STATUS_TRANSITION_FIELDS: readonly ConditionField[] = [
  "status",
  "previousStatus",
  "integrationType",
  "integrationId",
];

export function allowedFieldsForTrigger(trigger: ParsedTriggerConfig): readonly ConditionField[] {
  switch (trigger.triggerType) {
    case "schedule":
      return [];
    case "event":
      return EVENT_FIELDS[trigger.config.eventType];
    case "status-transition":
      return STATUS_TRANSITION_FIELDS;
    default: {
      const _never: never = trigger;
      return _never;
    }
  }
}

function countNodes(node: ConditionNode): number {
  if (node.op === "and" || node.op === "or")
    return 1 + node.nodes.reduce((total, child) => total + countNodes(child), 0);
  return 1;
}

function walk(input: unknown, depth: number, allowed: ReadonlySet<ConditionField>): ConditionNode {
  if (depth > CONDITION_MAX_DEPTH)
    throw new AutomationError("VALIDATION_ERROR", "Condition is too deep");
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AutomationError("VALIDATION_ERROR", "Invalid condition");
  const record = input as Record<string, unknown>;
  if (record.op === "and" || record.op === "or") {
    if (!Array.isArray(record.nodes) || record.nodes.length < 1 || record.nodes.length > 8)
      throw new AutomationError("VALIDATION_ERROR", "Invalid condition nodes");
    const extra = Object.keys(record).filter((key) => key !== "op" && key !== "nodes");
    if (extra.length > 0) throw new AutomationError("VALIDATION_ERROR", "Unknown condition field");
    return {
      op: record.op,
      nodes: record.nodes.map((child) => walk(child, depth + 1, allowed)),
    };
  }
  const op = record.op;
  if (typeof op !== "string" || !(CONDITION_COMPARE_OPS as readonly string[]).includes(op))
    throw new AutomationError("VALIDATION_ERROR", "Invalid condition operator");
  const field = record.field;
  if (typeof field !== "string" || !(CONDITION_FIELDS as readonly string[]).includes(field))
    throw new AutomationError("VALIDATION_ERROR", "Unknown condition field");
  const parsed = compareSchema.safeParse(record);
  if (!parsed.success) throw new AutomationError("VALIDATION_ERROR", "Invalid condition");
  if (!allowed.has(parsed.data.field))
    throw new AutomationError("VALIDATION_ERROR", "Unknown condition field");
  const fieldType = FIELD_TYPES[parsed.data.field];
  if (parsed.data.op === "contains") {
    if (fieldType !== "string" || typeof parsed.data.value !== "string")
      throw new AutomationError("VALIDATION_ERROR", "contains requires a string field and value");
  } else if (
    parsed.data.op === "lt" ||
    parsed.data.op === "lte" ||
    parsed.data.op === "gt" ||
    parsed.data.op === "gte"
  ) {
    if (fieldType !== "number" || typeof parsed.data.value !== "number")
      throw new AutomationError("VALIDATION_ERROR", "Numeric comparison requires a number field");
  } else if (fieldType === "string" && typeof parsed.data.value !== "string") {
    throw new AutomationError("VALIDATION_ERROR", "Type mismatch in condition value");
  }
  return parsed.data;
}

export function parseConditionConfig(
  trigger: ParsedTriggerConfig,
  input: unknown,
): ConditionNode | null {
  if (input == null) return null;
  const allowed = new Set(allowedFieldsForTrigger(trigger));
  if (allowed.size === 0)
    throw new AutomationError("VALIDATION_ERROR", "Schedule triggers cannot use conditions");
  const parsed = walk(input, 1, allowed);
  if (countNodes(parsed) > CONDITION_MAX_NODES)
    throw new AutomationError("VALIDATION_ERROR", "Condition has too many nodes");
  return parsed;
}

function compare(op: ConditionCompareOp, left: ConditionValue, right: ConditionValue): boolean {
  if (op === "contains") {
    if (typeof left !== "string" || typeof right !== "string") return false;
    return left.includes(right);
  }
  if (op === "eq") return left === right;
  if (op === "neq") return left !== right;
  if (typeof left !== "number" || typeof right !== "number") return false;
  switch (op) {
    case "lt":
      return left < right;
    case "lte":
      return left <= right;
    case "gt":
      return left > right;
    case "gte":
      return left >= right;
    default: {
      const _never: never = op;
      return _never;
    }
  }
}

function isLogicCondition(node: ConditionNode): node is LogicCondition {
  return node.op === "and" || node.op === "or";
}

export function evaluateCondition(
  node: ConditionNode | null,
  fields: Readonly<Record<string, ConditionValue>>,
): boolean {
  if (!node) return true;
  if (isLogicCondition(node)) {
    if (node.op === "and") return node.nodes.every((child) => evaluateCondition(child, fields));
    return node.nodes.some((child) => evaluateCondition(child, fields));
  }
  const left = fields[node.field];
  if (left === undefined) return false;
  if (typeof left !== typeof node.value) return false;
  return compare(node.op, left, node.value);
}
