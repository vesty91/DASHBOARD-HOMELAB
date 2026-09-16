export function liveHealthBody() {
  return {
    status: "live" as const,
    version: process.env.APP_VERSION?.trim() || "1.4.0",
  };
}
