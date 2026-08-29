import { probeHttp, type HealthErrorCode, type HealthStatus } from "@dashboard/monitoring";
import { hasPermission, type PermissionSubject } from "@dashboard/permissions";
import { z } from "zod";

export const appTargetSchema = z.enum(["same-tab", "new-tab"]);
const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .transform((value, context) => {
    try {
      const url = new URL(value);
      if (
        !["http:", "https:"].includes(url.protocol) ||
        !url.hostname ||
        url.username ||
        url.password
      )
        throw new Error();
      return url.toString();
    } catch {
      context.addIssue({
        code: "custom",
        message: "A valid HTTP(S) URL without credentials is required",
      });
      return z.NEVER;
    }
  });
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable();
export const LOCAL_APP_ICON_REF = /^\/app-icons\/[a-z0-9]+(?:-[a-z0-9]+)*\.(svg|png|webp)$/;
const iconRef = z
  .string()
  .trim()
  .max(2048)
  .transform((value, context) => {
    if (!value) return null;
    if (LOCAL_APP_ICON_REF.test(value)) return value;
    try {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
        throw new Error();
      return url.toString();
    } catch {
      context.addIssue({
        code: "custom",
        message: "Icon must be an HTTP(S) URL or a local /app-icons/<slug>.(svg|png|webp) path",
      });
      return z.NEVER;
    }
  })
  .nullable();
const tag = z.string().trim().normalize("NFKC").min(1).max(32);
export const healthConfigSchema = z
  .object({
    path: z.string().trim().max(512).default("/"),
    method: z.enum(["GET", "HEAD"]).default("GET"),
    timeoutMs: z.number().int().min(500).max(10_000).default(5000),
    expectedStatusMin: z.number().int().min(100).max(599).default(200),
    expectedStatusMax: z.number().int().min(100).max(599).default(399),
  })
  .refine(
    (value) => value.expectedStatusMin <= value.expectedStatusMax,
    "Invalid expected status range",
  )
  .refine((value) => {
    try {
      const url = new URL(value.path, "http://health.invalid");
      return value.path.startsWith("/") && url.origin === "http://health.invalid";
    } catch {
      return false;
    }
  }, "Health path must be same-origin");
export type HealthConfig = z.infer<typeof healthConfigSchema>;
export const appCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: nullableText(1000).default(null),
    url: httpUrl,
    iconRef: iconRef.default(null),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable()
      .default(null),
    target: appTargetSchema.default("new-tab"),
    tags: z.array(tag).max(20).default([]),
    healthcheckEnabled: z.boolean().default(false),
    healthcheckConfig: healthConfigSchema.default({
      path: "/",
      method: "GET",
      timeoutMs: 5000,
      expectedStatusMin: 200,
      expectedStatusMax: 399,
    }),
  })
  .transform((value, context) => {
    const seen = new Set<string>();
    for (const valueTag of value.tags) {
      const canonical = valueTag.toLocaleLowerCase("und");
      if (seen.has(canonical)) {
        context.addIssue({ code: "custom", message: "Duplicate tags" });
        return z.NEVER;
      }
      seen.add(canonical);
    }
    return value;
  });
export const appUpdateSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    description: nullableText(1000).optional(),
    url: httpUrl.optional(),
    iconRef: iconRef.optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable()
      .optional(),
    target: appTargetSchema.optional(),
    tags: z.array(tag).max(20).optional(),
    healthcheckEnabled: z.boolean().optional(),
    healthcheckConfig: healthConfigSchema.optional(),
  })
  .superRefine((value, context) => {
    if (!value.tags) return;
    const seen = new Set<string>();
    for (const valueTag of value.tags) {
      const canonical = valueTag.toLocaleLowerCase("und");
      if (seen.has(canonical))
        context.addIssue({ code: "custom", path: ["tags"], message: "Duplicate tags" });
      seen.add(canonical);
    }
  });
export type AppCreateInput = z.infer<typeof appCreateSchema>;
export type AppUpdateInput = z.infer<typeof appUpdateSchema>;
export interface AppDto {
  id: string;
  name: string;
  description: string | null;
  url: string;
  iconRef: string | null;
  color: string | null;
  target: "same-tab" | "new-tab";
  tags: string[];
  healthcheckEnabled: boolean;
  healthcheckConfig: HealthConfig;
  healthStatus: "unknown" | HealthStatus;
  lastCheckedAt: Date | null;
  lastLatencyMs: number | null;
  lastHttpStatus: number | null;
  lastHealthErrorCode: HealthErrorCode | null;
  healthConfigRevision: number;
  integrationId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface AppStore {
  list(limit: number, cursor?: string): Promise<AppDto[]>;
  findById(id: string): Promise<AppDto | undefined>;
  create(input: AppCreateInput): Promise<AppDto>;
  update(input: AppUpdateInput): Promise<AppDto | undefined>;
  delete(id: string): Promise<boolean>;
  persistHealthResult(
    id: string,
    revision: number,
    result: {
      status: HealthStatus;
      latencyMs: number;
      httpStatus: number | null;
      errorCode: HealthErrorCode | null;
    },
  ): Promise<boolean>;
}
export interface AppActor {
  userId: string | null;
  subject: PermissionSubject | null;
}
export class AppError extends Error {
  constructor(
    readonly code:
      | "UNAUTHORIZED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "VALIDATION_ERROR"
      | "CONFLICT"
      | "INTERNAL_ERROR"
      | "HEALTH_STALE_RESULT",
    message: string,
  ) {
    super(message);
  }
}
const requireAccess = (actor: AppActor, permission: "app.read" | "app.manage") => {
  if (!actor.userId || !actor.subject || actor.subject.status !== "active")
    throw new AppError("UNAUTHORIZED", "Authentication required");
  if (!hasPermission(actor.subject, permission))
    throw new AppError("FORBIDDEN", "Permission denied");
};

export function createAppService(store: AppStore) {
  return {
    async list(actor: AppActor, input: { limit: number; cursor?: string | undefined }) {
      requireAccess(actor, "app.read");
      const rows = await store.list(input.limit + 1, input.cursor);
      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;
      return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
    },
    async get(id: string, actor: AppActor) {
      requireAccess(actor, "app.read");
      const app = await store.findById(id);
      if (!app) throw new AppError("NOT_FOUND", "App not found");
      return app;
    },
    async create(input: AppCreateInput, actor: AppActor) {
      requireAccess(actor, "app.manage");
      return store.create(appCreateSchema.parse(input));
    },
    async update(input: AppUpdateInput, actor: AppActor) {
      requireAccess(actor, "app.manage");
      const app = await store.update(appUpdateSchema.parse(input));
      if (!app) throw new AppError("NOT_FOUND", "App not found");
      return app;
    },
    async delete(id: string, actor: AppActor) {
      requireAccess(actor, "app.manage");
      if (!(await store.delete(id))) throw new AppError("NOT_FOUND", "App not found");
      return { deleted: true };
    },
    async test(id: string, actor: AppActor) {
      requireAccess(actor, "app.manage");
      const app = await store.findById(id);
      if (!app) throw new AppError("NOT_FOUND", "App not found");
      const revision = app.healthConfigRevision;
      const target = new URL(app.healthcheckConfig.path, app.url);
      if (target.origin !== new URL(app.url).origin)
        throw new AppError("VALIDATION_ERROR", "Invalid health path");
      const result = await probeHttp({
        url: target,
        method: app.healthcheckConfig.method,
        timeoutMs: app.healthcheckConfig.timeoutMs,
        expectedStatusMin: app.healthcheckConfig.expectedStatusMin,
        expectedStatusMax: app.healthcheckConfig.expectedStatusMax,
      });
      if (!(await store.persistHealthResult(id, revision, result)))
        throw new AppError("HEALTH_STALE_RESULT", "Health configuration changed during test");
      return result;
    },
  };
}
export type AppService = ReturnType<typeof createAppService>;
