import { z } from "zod";
import { DEPENDENCY_RELATIONSHIPS } from "./types";

const serviceKeySchema = z.string().uuid();

export const listDependenciesSchema = z.object({
  serviceKeys: z.array(serviceKeySchema).max(100).optional(),
  limit: z.number().int().min(1).max(1_000).default(500),
});

export const createDependencySchema = z
  .object({
    upstreamServiceKey: serviceKeySchema,
    downstreamServiceKey: serviceKeySchema,
    relationship: z.enum(DEPENDENCY_RELATIONSHIPS).default("depends_on"),
  })
  .superRefine((value, ctx) => {
    if (value.upstreamServiceKey === value.downstreamServiceKey) {
      ctx.addIssue({
        code: "custom",
        message: "Self-dependency is not allowed",
        path: ["downstreamServiceKey"],
      });
    }
  });

export const deleteDependencySchema = z.object({
  id: z.string().uuid(),
});

export const getDependencySchema = z.object({
  id: z.string().uuid(),
});

export type ListDependenciesInput = z.infer<typeof listDependenciesSchema>;
export type CreateDependencyInput = z.infer<typeof createDependencySchema>;
export type DeleteDependencyInput = z.infer<typeof deleteDependencySchema>;
export type GetDependencyInput = z.infer<typeof getDependencySchema>;
