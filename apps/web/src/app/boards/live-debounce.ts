export function createKeyedDebouncer(
  delayMs: number,
  run: (key: string) => void,
): { trigger(key: string): void; clear(): void } {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return {
    trigger(key: string) {
      const existing = timers.get(key);
      if (existing !== undefined) clearTimeout(existing);
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key);
          run(key);
        }, delayMs),
      );
    },
    clear() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}
