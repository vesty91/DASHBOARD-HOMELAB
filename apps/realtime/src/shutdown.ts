const SHUTDOWN_MS = 10_000;

export function bindProcessShutdown(close: () => Promise<void>): void {
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(JSON.stringify({ msg: "shutdown", signal }));
    const timer = setTimeout(() => {
      console.error(JSON.stringify({ msg: "shutdown_timeout", signal }));
      process.exit(1);
    }, SHUTDOWN_MS);
    timer.unref();
    void close()
      .then(() => {
        clearTimeout(timer);
        process.exit(0);
      })
      .catch(() => {
        clearTimeout(timer);
        console.error(JSON.stringify({ msg: "shutdown_failed", signal }));
        process.exit(1);
      });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}
