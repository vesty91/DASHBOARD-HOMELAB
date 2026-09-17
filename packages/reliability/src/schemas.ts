import { z } from "zod";
import { SLO_OBJECTIVE_BPS_MAX, SLO_OBJECTIVE_BPS_MIN } from "./slo-math";

export const utcDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "UTC date required (YYYY-MM-DD)");

export const utcHourSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}$/, "UTC hour required (YYYY-MM-DDTHH)");

export const serviceKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9:_-]+$/, "opaque service key");

export const listDailyReliabilitySchema = z
  .object({
    serviceKeys: z.array(serviceKeySchema).min(1).max(50),
    fromDateUtc: utcDateSchema,
    toDateUtc: utcDateSchema,
    limit: z.number().int().min(1).max(366).default(90),
  })
  .superRefine((value, ctx) => {
    if (value.toDateUtc < value.fromDateUtc) {
      ctx.addIssue({
        code: "custom",
        message: "toDateUtc must be >= fromDateUtc",
        path: ["toDateUtc"],
      });
    }
  });

export const listHourlyReliabilitySchema = z
  .object({
    serviceKeys: z.array(serviceKeySchema).min(1).max(50),
    fromHourUtc: utcHourSchema,
    toHourUtc: utcHourSchema,
    limit: z.number().int().min(1).max(168).default(168),
  })
  .superRefine((value, ctx) => {
    if (value.toHourUtc < value.fromHourUtc) {
      ctx.addIssue({
        code: "custom",
        message: "toHourUtc must be >= fromHourUtc",
        path: ["toHourUtc"],
      });
    }
  });

export const rebuildReliabilitySchema = z.object({
  days: z.number().int().min(1).max(90).default(7),
  serviceKeys: z.array(serviceKeySchema).max(50).optional(),
});

export const sloWindowDaysSchema = z.union([z.literal(7), z.literal(30), z.literal(90)]);

export const objectiveBasisPointsSchema = z
  .number()
  .int()
  .min(SLO_OBJECTIVE_BPS_MIN)
  .max(SLO_OBJECTIVE_BPS_MAX);

export const createSloSchema = z.object({
  serviceKey: serviceKeySchema,
  name: z.string().trim().min(1).max(200),
  objectiveBasisPoints: objectiveBasisPointsSchema,
  windowDays: sloWindowDaysSchema,
  excludeMaintenance: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

export const updateSloSchema = z.object({
  id: z.string().uuid(),
  expectedConfigRevision: z.number().int().positive(),
  name: z.string().trim().min(1).max(200).optional(),
  objectiveBasisPoints: objectiveBasisPointsSchema.optional(),
  windowDays: sloWindowDaysSchema.optional(),
  excludeMaintenance: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const deleteSloSchema = z.object({
  id: z.string().uuid(),
  expectedConfigRevision: z.number().int().positive(),
});

export const getSloSchema = z.object({
  id: z.string().uuid(),
});

export const listSlosSchema = z.object({
  serviceKeys: z.array(serviceKeySchema).max(50).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

export const evaluateSloSchema = z.object({
  id: z.string().uuid(),
});

export const summarizeReliabilitySchema = z.object({
  serviceKeys: z.array(serviceKeySchema).max(50).optional(),
  windowDays: sloWindowDaysSchema.default(30),
});

export type ListDailyReliabilityInput = z.infer<typeof listDailyReliabilitySchema>;
export type ListHourlyReliabilityInput = z.infer<typeof listHourlyReliabilitySchema>;
export type RebuildReliabilityInput = z.infer<typeof rebuildReliabilitySchema>;
export type CreateSloInput = z.infer<typeof createSloSchema>;
export type UpdateSloInput = z.infer<typeof updateSloSchema>;
export type DeleteSloInput = z.infer<typeof deleteSloSchema>;
export type ListSlosInput = z.infer<typeof listSlosSchema>;
export type EvaluateSloInput = z.infer<typeof evaluateSloSchema>;
export type SummarizeReliabilityInput = z.infer<typeof summarizeReliabilitySchema>;
