export async function publishAfterSuccess<T>(
  run: () => Promise<T>,
  publish: () => Promise<void>,
): Promise<T> {
  const result = await run();
  try {
    await publish();
  } catch (error) {
    void error;
    console.error(JSON.stringify({ msg: "realtime_publish_failed" }));
  }
  return result;
}
