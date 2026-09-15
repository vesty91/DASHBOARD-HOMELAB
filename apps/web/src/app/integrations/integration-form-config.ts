export function configFromForm(formData: FormData) {
  const timeoutRaw = Number(formData.get("timeoutMs") ?? 8000);
  const trustedCaRaw = formData.get("trustedCaPem");
  const trustedCaPem =
    typeof trustedCaRaw === "string" && trustedCaRaw.trim() !== "" ? trustedCaRaw : undefined;
  const accountRaw = formData.get("account");
  const account =
    typeof accountRaw === "string" && accountRaw.trim() !== "" ? accountRaw.trim() : undefined;
  const identityRaw = formData.get("identity");
  const identity =
    typeof identityRaw === "string" && identityRaw.trim() !== "" ? identityRaw.trim() : undefined;
  const endpointsRaw = formData.get("endpoints");
  let endpoints: unknown;
  if (typeof endpointsRaw === "string") {
    const trimmed = endpointsRaw.trim();
    if (trimmed === "") endpoints = [];
    else {
      try {
        endpoints = JSON.parse(trimmed) as unknown;
      } catch {
        endpoints = trimmed;
      }
    }
  }
  const apiKeyHeaderRaw = formData.get("apiKeyHeader");
  const apiKeyHeader =
    typeof apiKeyHeaderRaw === "string" && apiKeyHeaderRaw.trim() !== ""
      ? apiKeyHeaderRaw.trim()
      : undefined;
  return {
    verifyTls: formData.get("verifyTls") === "on",
    timeoutMs: Number.isFinite(timeoutRaw) ? timeoutRaw : 8000,
    ...(account === undefined ? {} : { account }),
    ...(identity === undefined ? {} : { identity }),
    ...(trustedCaPem === undefined ? {} : { trustedCaPem }),
    ...(endpoints === undefined ? {} : { endpoints }),
    ...(apiKeyHeader === undefined ? {} : { apiKeyHeader }),
  };
}
