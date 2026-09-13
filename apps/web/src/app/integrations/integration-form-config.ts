export function configFromForm(formData: FormData) {
  const timeoutRaw = Number(formData.get("timeoutMs") ?? 8000);
  const trustedCaRaw = formData.get("trustedCaPem");
  const trustedCaPem =
    typeof trustedCaRaw === "string" && trustedCaRaw.trim() !== "" ? trustedCaRaw : undefined;
  const accountRaw = formData.get("account");
  const account =
    typeof accountRaw === "string" && accountRaw.trim() !== "" ? accountRaw.trim() : undefined;
  return {
    verifyTls: formData.get("verifyTls") === "on",
    timeoutMs: Number.isFinite(timeoutRaw) ? timeoutRaw : 8000,
    ...(account === undefined ? {} : { account }),
    ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
  };
}
