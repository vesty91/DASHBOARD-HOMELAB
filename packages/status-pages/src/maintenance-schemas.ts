import { z } from "zod";
import {
  MAINTENANCE_MAX_DURATION_MS,
  MAINTENANCE_MAX_FUTURE_START_MS,
  MAINTENANCE_MAX_PAST_START_MS,
  MAINTENANCE_MIN_DURATION_MS,
  MAINTENANCE_NAME_MAX,
} from "./maintenance-constants";
import { statusPageDescriptionSchema } from "./schemas";

export const maintenanceNameSchema = z.string().trim().min(1).max(MAINTENANCE_NAME_MAX);

const utcInstantSchema = z.coerce.date().refine((value) => !Number.isNaN(value.getTime()), {
  message: "Invalid UTC instant",
});

function assertMaintenanceWindowBounds(startsAt: Date, endsAt: Date, now: Date): void {
  if (!(endsAt.getTime() > startsAt.getTime())) {
    throw new Error("endsAt must be after startsAt");
  }
  const durationMs = endsAt.getTime() - startsAt.getTime();
  if (durationMs < MAINTENANCE_MIN_DURATION_MS) {
    throw new Error("Maintenance duration is too short");
  }
  if (durationMs > MAINTENANCE_MAX_DURATION_MS) {
    throw new Error("Maintenance duration exceeds maximum");
  }
  const earliestStart = now.getTime() - MAINTENANCE_MAX_PAST_START_MS;
  const latestStart = now.getTime() + MAINTENANCE_MAX_FUTURE_START_MS;
  if (startsAt.getTime() < earliestStart) {
    throw new Error("startsAt is too far in the past");
  }
  if (startsAt.getTime() > latestStart) {
    throw new Error("startsAt is too far in the future");
  }
}

export const scheduleMaintenanceWindowSchema = z
  .object({
    name: maintenanceNameSchema,
    description: statusPageDescriptionSchema.default(""),
    startsAt: utcInstantSchema,
    endsAt: utcInstantSchema,
    integrationIds: z.array(z.uuid()).min(1).max(100),
  })
  .superRefine((value, ctx) => {
    try {
      assertMaintenanceWindowBounds(value.startsAt, value.endsAt, new Date());
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Invalid maintenance window",
      });
    }
    const unique = new Set(value.integrationIds);
    if (unique.size !== value.integrationIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "integrationIds must be unique",
        path: ["integrationIds"],
      });
    }
  });

export const cancelMaintenanceWindowSchema = z.object({
  id: z.uuid(),
});

export const getMaintenanceWindowSchema = z.object({
  id: z.uuid(),
});

export type ScheduleMaintenanceWindowInput = z.infer<typeof scheduleMaintenanceWindowSchema>;
export type CancelMaintenanceWindowInput = z.infer<typeof cancelMaintenanceWindowSchema>;

/**
 * Validates window bounds against an injectable clock (for tests / worker).
 * Schemas use wall-clock at parse time; domain service re-validates with deps.now().
 */
export function validateMaintenanceWindowBounds(
  startsAt: Date,
  endsAt: Date,
  now: Date,
): { ok: true } | { ok: false; message: string } {
  try {
    assertMaintenanceWindowBounds(startsAt, endsAt, now);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Invalid maintenance window",
    };
  }
}
