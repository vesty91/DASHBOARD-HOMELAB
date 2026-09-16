import { z } from "zod";
import { isReservedStatusPageSlug, normalizeStatusPageSlug, STATUS_PAGE_SLUG_REGEX } from "./slug";
import { MAINTENANCE_WINDOW_STATUSES, STATUS_PAGE_VISIBILITIES } from "./types";

export const statusPageSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .transform(normalizeStatusPageSlug)
  .refine((value) => STATUS_PAGE_SLUG_REGEX.test(value), {
    message: "Slug must be lowercase and URL-safe",
  })
  .refine((value) => !isReservedStatusPageSlug(value), {
    message: "Slug is reserved",
  });

export const statusPageNameSchema = z.string().trim().min(1).max(120);
export const statusPageDescriptionSchema = z
  .string()
  .trim()
  .max(1000)
  .transform((value) => value || null);
export const statusPageVisibilitySchema = z.enum(STATUS_PAGE_VISIBILITIES);
export const configRevisionSchema = z.number().int().positive();

export const createStatusPageSchema = z.object({
  name: statusPageNameSchema,
  slug: statusPageSlugSchema,
  description: statusPageDescriptionSchema.default(""),
  visibility: statusPageVisibilitySchema.default("private"),
  enabled: z.boolean().default(true),
});

export const updateStatusPageSchema = z.object({
  id: z.uuid(),
  expectedConfigRevision: configRevisionSchema,
  name: statusPageNameSchema,
  slug: statusPageSlugSchema,
  description: statusPageDescriptionSchema.default(""),
  visibility: statusPageVisibilitySchema,
  enabled: z.boolean(),
});

export const deleteStatusPageSchema = z.object({
  id: z.uuid(),
  expectedConfigRevision: configRevisionSchema,
});

export const statusPageServiceInputSchema = z.object({
  sourceIntegrationId: z.uuid(),
  displayName: z.string().trim().min(1).max(120),
  description: statusPageDescriptionSchema.default(""),
  sortOrder: z.number().int().min(0).max(10_000),
  showIncidentHistory: z.boolean().default(true),
});

export const replaceStatusPageServicesSchema = z.object({
  statusPageId: z.uuid(),
  expectedConfigRevision: configRevisionSchema,
  services: z.array(statusPageServiceInputSchema).max(100),
});

export const getStatusPageSchema = z.object({
  id: z.uuid(),
});

export const getPublicStatusPageSchema = z.object({
  slug: statusPageSlugSchema,
});

export const maintenanceWindowStatusSchema = z.enum(MAINTENANCE_WINDOW_STATUSES);

export type CreateStatusPageInput = z.infer<typeof createStatusPageSchema>;
export type UpdateStatusPageInput = z.infer<typeof updateStatusPageSchema>;
export type DeleteStatusPageInput = z.infer<typeof deleteStatusPageSchema>;
export type ReplaceStatusPageServicesInput = z.infer<typeof replaceStatusPageServicesSchema>;
export type GetPublicStatusPageInput = z.infer<typeof getPublicStatusPageSchema>;
