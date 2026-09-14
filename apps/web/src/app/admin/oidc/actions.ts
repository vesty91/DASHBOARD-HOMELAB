"use server";

import { oidcSettingsInputSchema } from "@dashboard/auth";
import { revalidatePath } from "next/cache";
import { getBoardCaller } from "@/lib/server/board-api";

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export async function saveOidcSettingsAction(formData: FormData) {
  const clientSecret = optionalText(formData.get("clientSecret"));
  await (
    await getBoardCaller()
  ).oidc.saveSettings(
    oidcSettingsInputSchema.parse({
      enabled: formData.get("enabled") === "on",
      issuer: optionalText(formData.get("issuer")),
      clientId: optionalText(formData.get("clientId")),
      displayName: optionalText(formData.get("displayName")),
      scopes: String(formData.get("scopes") ?? "openid profile email groups"),
      redirectUri: optionalText(formData.get("redirectUri")),
      groupClaim: String(formData.get("groupClaim") ?? "groups"),
      autoLinkVerifiedEmail: formData.get("autoLinkVerifiedEmail") === "on",
      autoProvision: formData.get("autoProvision") === "on",
      allowLocalLogin: formData.get("allowLocalLogin") === "on",
      ...(clientSecret ? { clientSecret } : {}),
    }),
  );
  revalidatePath("/admin/oidc");
}

export async function saveOidcMappingsAction(formData: FormData) {
  const oidcGroups = formData.getAll("oidcGroup").map(String);
  const localGroupIds = formData.getAll("localGroupId").map(String);
  const mappings = oidcGroups
    .map((oidcGroup, index) => ({
      oidcGroup: oidcGroup.trim(),
      localGroupId: localGroupIds[index] ?? "",
    }))
    .filter((mapping) => mapping.oidcGroup && mapping.localGroupId);
  await (await getBoardCaller()).oidc.replaceMappings({ mappings });
  revalidatePath("/admin/oidc");
}
