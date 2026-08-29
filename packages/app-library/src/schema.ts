import { z } from "zod";
import { APP_LIBRARY_CATEGORIES, APP_LIFECYCLE_STATUSES, LOCAL_APP_ICON_PATH } from "./types";

const slugId = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "App definition id must be kebab-case");

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

const tag = z
  .string()
  .trim()
  .normalize("NFKC")
  .min(1)
  .max(32)
  .transform((value) => value.toLocaleLowerCase("und"));

export const appDefinitionSchema = z
  .object({
    id: slugId,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(280),
    category: z.enum(APP_LIBRARY_CATEGORIES),
    icon: z.object({
      path: z
        .string()
        .trim()
        .regex(LOCAL_APP_ICON_PATH, "Icon path must be a local /app-icons/<slug>.(svg|png|webp)"),
      source: z.enum(["dashboard-icons", "internal"]),
    }),
    tags: z.array(tag).min(1).max(8),
    website: httpUrl.optional(),
    documentation: httpUrl.optional(),
    defaults: z
      .object({
        protocol: z.enum(["http", "https"]).optional(),
        port: z.number().int().min(1).max(65535).optional(),
        path: z
          .string()
          .trim()
          .max(512)
          .refine((value) => value.startsWith("/"), "Default path must be same-origin")
          .optional(),
        target: z.enum(["same-tab", "new-tab"]).optional(),
      })
      .optional(),
    health: z
      .object({
        suggestedPath: z
          .string()
          .trim()
          .max(512)
          .refine((value) => value.startsWith("/"), "Health path must be same-origin")
          .optional(),
        suggestedMethod: z.enum(["GET", "HEAD"]).optional(),
      })
      .optional(),
    discovery: z
      .object({
        dockerImages: z
          .array(
            z
              .string()
              .trim()
              .min(1)
              .max(256)
              .refine(
                (value) =>
                  value.includes("/") &&
                  !value.includes(":") &&
                  !value.includes("@") &&
                  !value.includes("*") &&
                  !value.includes("..") &&
                  !value.includes(" ") &&
                  !value.includes("\\"),
                "Docker image patterns must be canonical names without tags, digests or wildcards",
              ),
          )
          .max(12)
          .optional(),
        containerNames: z.array(z.string().trim().min(1).max(128)).max(12).optional(),
      })
      .optional(),
    futureIntegrationType: slugId.optional(),
    lifecycle: z
      .object({
        status: z.enum(APP_LIFECYCLE_STATUSES),
        replacedBy: slugId.optional(),
        note: z.string().trim().min(1).max(280).optional(),
      })
      .optional(),
  })
  .superRefine((value, context) => {
    const seen = new Set<string>();
    for (const item of value.tags) {
      if (seen.has(item)) {
        context.addIssue({ code: "custom", path: ["tags"], message: "Duplicate tags" });
        return;
      }
      seen.add(item);
    }
    const replacedBy = value.lifecycle?.replacedBy;
    if (value.lifecycle?.status === "active" && replacedBy) {
      context.addIssue({
        code: "custom",
        path: ["lifecycle", "replacedBy"],
        message: "Active definitions must not declare replacedBy",
      });
    }
    if (replacedBy && replacedBy === value.id) {
      context.addIssue({
        code: "custom",
        path: ["lifecycle", "replacedBy"],
        message: "replacedBy cannot reference the same definition",
      });
    }
  });
