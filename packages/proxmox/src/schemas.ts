import { z } from "zod";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  MIN_TIMEOUT_MS,
  normalizeTrustedCaPem,
} from "@dashboard/integrations";

export const proxmoxApiTokenSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => !/[^\u0021-\u007E]/u.test(value), "Proxmox API token must be visible ASCII")
  .refine(
    (value) => /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+![A-Za-z0-9._-]+=[A-Za-z0-9._-]+$/u.test(value),
    "Proxmox API token must be USER@REALM!TOKENID=SECRET",
  );

export const proxmoxConfigSchema = z
  .object({
    verifyTls: z.boolean().default(true),
    timeoutMs: z.number().int().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
    trustedCaPem: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.trustedCaPem === undefined || data.trustedCaPem.trim() === "") return;
    try {
      normalizeTrustedCaPem(data.trustedCaPem);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        path: ["trustedCaPem"],
        message: error instanceof Error ? error.message : "Invalid trusted CA PEM",
      });
      return;
    }
    if (data.verifyTls === false) {
      ctx.addIssue({
        code: "custom",
        path: ["trustedCaPem"],
        message: "trustedCaPem cannot be set when verifyTls is false",
      });
    }
  })
  .transform((data) => {
    const trustedCaPem =
      data.trustedCaPem === undefined || data.trustedCaPem.trim() === ""
        ? undefined
        : normalizeTrustedCaPem(data.trustedCaPem);
    return {
      verifyTls: data.verifyTls,
      timeoutMs: data.timeoutMs,
      ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
    };
  });

export const proxmoxSecretSchema = z.object({
  apiToken: proxmoxApiTokenSchema,
});

export const proxmoxIntegrationInputSchema = z.object({
  integrationId: z.uuid(),
});

export const proxmoxGuestActionInputSchema = z.object({
  integrationId: z.uuid(),
  node: z.string().min(1).max(63),
  guestType: z.enum(["qemu", "lxc"]),
  vmid: z.number().int().min(1).max(999_999_999),
  expectedConfigRevision: z.number().int().positive().optional(),
});

export type ProxmoxConfig = z.infer<typeof proxmoxConfigSchema>;
export type ProxmoxSecrets = z.infer<typeof proxmoxSecretSchema>;
export type ProxmoxGuestActionInput = z.infer<typeof proxmoxGuestActionInputSchema>;
