import { z } from "zod";

export const utcDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "UTC date required (YYYY-MM-DD)");

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

export const rebuildReliabilitySchema = z.object({
  days: z.number().int().min(1).max(90).default(7),
  serviceKeys: z.array(serviceKeySchema).max(50).optional(),
});

export type ListDailyReliabilityInput = z.infer<typeof listDailyReliabilitySchema>;
export type RebuildReliabilityInput = z.infer<typeof rebuildReliabilitySchema>;
