export function configFromForm(formData: FormData) {
  const timeoutRaw = Number(formData.get("timeoutMs") ?? 8000);
  const trustedCaRaw = formData.get("trustedCaPem");
  const trustedCaPem =
    typeof trustedCaRaw === "string" && trustedCaRaw.trim() !== "" ? trustedCaRaw : undefined;
  return {
    verifyTls: formData.get("verifyTls") === "on",
    timeoutMs: Number.isFinite(timeoutRaw) ? timeoutRaw : 8000,
    ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
  };
}
