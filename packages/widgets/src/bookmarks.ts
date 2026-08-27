import { z } from "zod";
import type { WidgetContract } from "./types";
import { parseHttpUrl } from "./urls";

export const bookmarkTargetSchema = z.enum(["same-tab", "new-tab"]);

export const bookmarkLinkSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(120),
  url: z
    .string()
    .trim()
    .max(2048)
    .transform((value, context) => {
      const parsed = parseHttpUrl(value);
      if (!parsed) {
        context.addIssue({
          code: "custom",
          message: "Bookmark URL must be HTTP(S) without credentials",
        });
        return z.NEVER;
      }
      return parsed;
    }),
  target: bookmarkTargetSchema.default("new-tab"),
});

export const bookmarksConfigSchema = z.object({
  links: z.array(bookmarkLinkSchema).max(50).default([]),
});

export type BookmarkLink = z.infer<typeof bookmarkLinkSchema>;
export type BookmarksConfig = z.infer<typeof bookmarksConfigSchema>;

export const bookmarksDefaultConfig: BookmarksConfig = { links: [] };

export const bookmarksContract: WidgetContract<BookmarksConfig> = {
  id: "bookmarks",
  version: 1,
  name: "Signets",
  description: "Liste de liens HTTP(S) rendus sans fetch serveur.",
  category: "navigation",
  defaultSize: { w: 4, h: 4 },
  minSize: { w: 2, h: 2 },
  maxSize: { w: 12, h: 12 },
  defaultConfig: bookmarksDefaultConfig,
  configSchema: bookmarksConfigSchema,
  publicSafe: false,
};
