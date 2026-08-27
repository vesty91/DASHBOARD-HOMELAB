export interface PendingLayout {
  layoutId: string;
  items: { itemId: string; x: number; y: number; w: number; h: number }[];
}

export function createBoardMutationCoordinator(options: {
  initialRevision: number;
  saveLayout: (input: { expectedRevision: number } & PendingLayout) => Promise<number>;
  onConflict: () => void;
  debounceMs: number;
}) {
  let revision = options.initialRevision;
  let queue = Promise.resolve();
  let pending: PendingLayout | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let conflict = false;

  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(async () => {
      if (conflict) return;
      try {
        await task();
      } catch {
        conflict = true;
        pending = null;
        if (timer) clearTimeout(timer);
        timer = null;
        options.onConflict();
      }
    });
    return queue;
  };

  const flushNow = () =>
    enqueue(async () => {
      if (!pending || conflict) return;
      const save = pending;
      pending = null;
      if (timer) clearTimeout(timer);
      timer = null;
      revision = await options.saveLayout({ expectedRevision: revision, ...save });
    });

  return {
    getRevision: () => revision,
    hasConflict: () => conflict,
    scheduleLayout(next: PendingLayout) {
      if (conflict) return;
      pending = next;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void flushNow();
      }, options.debounceMs);
    },
    flushLayout: flushNow,
    runItemMutation(mutate: (expectedRevision: number) => Promise<number>) {
      if (conflict) return queue;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      return flushNow().then(() =>
        enqueue(async () => {
          revision = await mutate(revision);
        }),
      );
    },
  };
}
