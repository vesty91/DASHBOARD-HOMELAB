import { z } from "zod";

export const boardSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase and URL-safe");
export const boardNameSchema = z.string().trim().min(1).max(120);
export const boardDescriptionSchema = z
  .string()
  .trim()
  .max(1000)
  .transform((value) => value || null);
export const boardVisibilitySchema = z.enum(["private", "authenticated", "public"]);
export const revisionSchema = z.number().int().positive();
export const placementSchema = z.object({
  itemId: z.uuid(),
  x: z.number().int().min(0).max(1000),
  y: z.number().int().min(0).max(10000),
  w: z.number().int().min(1).max(64),
  h: z.number().int().min(1).max(1000),
});
export const itemTitleSchema = z
  .string()
  .trim()
  .max(120)
  .refine((value) => !/[<>]/.test(value), "Title must not contain HTML")
  .transform((value) => value || null)
  .nullable();
export const createBoardSchema = z.object({
  name: boardNameSchema,
  slug: boardSlugSchema,
  description: boardDescriptionSchema.default(""),
  visibility: boardVisibilitySchema.default("private"),
});
export const updateBoardSchema = z.object({
  boardId: z.uuid(),
  expectedRevision: revisionSchema,
  name: boardNameSchema,
  description: boardDescriptionSchema.default(""),
  visibility: boardVisibilitySchema.optional(),
});
export const updateLayoutBatchSchema = z.object({
  boardId: z.uuid(),
  layoutId: z.uuid(),
  expectedRevision: revisionSchema,
  items: z.array(placementSchema).min(1).max(200),
});
export const createBoardItemSchema = z.object({
  boardId: z.uuid(),
  expectedRevision: revisionSchema,
  widgetType: z.string().trim().min(1).max(80),
  title: itemTitleSchema.optional(),
  config: z.unknown(),
});
export const updateBoardItemSchema = z
  .object({
    boardId: z.uuid(),
    itemId: z.uuid(),
    expectedRevision: revisionSchema,
    title: itemTitleSchema.optional(),
    config: z.unknown().optional(),
  })
  .refine(
    (value) => value.title !== undefined || value.config !== undefined,
    "Item update requires title or config",
  );
export const deleteBoardItemSchema = z.object({
  boardId: z.uuid(),
  itemId: z.uuid(),
  expectedRevision: revisionSchema,
});
