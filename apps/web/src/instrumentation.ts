export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { APP_VERSION, assertRuntimeProductionEnv } = await import("./lib/env");
  assertRuntimeProductionEnv();
  console.log(
    JSON.stringify({
      msg: "startup",
      service: "web",
      version: APP_VERSION,
      environment: process.env.NODE_ENV ?? "development",
      port: Number(process.env.PORT ?? 3000),
    }),
  );
}
