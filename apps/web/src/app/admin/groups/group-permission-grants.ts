import { z } from "zod";
import { isPermission } from "@dashboard/permissions";

export const groupPermissionGrantsInputSchema = z.object({
  groupId: z.uuid(),
  permissions: z
    .array(z.string())
    .transform((values) => [...new Set(values)])
    .superRefine((values, ctx) => {
      for (const value of values) {
        if (!isPermission(value)) {
          ctx.addIssue({ code: "custom", message: "Unknown permission" });
          return;
        }
      }
    }),
});
