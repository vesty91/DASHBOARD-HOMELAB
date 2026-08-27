import {
  conflictFailure,
  unknownFailure,
  type BoardMutationFailure,
  type BoardMutationResult,
} from "./mutation-result";

export interface PendingLayout {
  layoutId: string;
  items: { itemId: string; x: number; y: number; w: number; h: number }[];
}

export function createBoardMutationCoordinator(options: {
  initialRevision: number;
  saveLayout: (
    input: { expectedRevision: number } & PendingLayout,
  ) => Promise<BoardMutationResult<{ revision: number }>>;
  onConflict: () => void;
  onError: (failure: BoardMutationFailure) => void;
  debounceMs: number;
}) {
  let revision = options.initialRevision;
  let queue = Promise.resolve();
  let pending: PendingLayout | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let conflict = false;

  const markConflict = () => {
    conflict = true;
    pending = null;
    if (timer) clearTimeout(timer);
    timer = null;
    options.onConflict();
  };

  const applyResult = <T extends { revision: number }>(
    result: BoardMutationResult<T>,
  ): BoardMutationResult<T> => {
    if (result.ok) {
      revision = result.revision;
      return result;
    }
    if (result.code === "CONFLICT") markConflict();
    else options.onError(result);
    return result;
  };

  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(async () => {
      if (conflict) return;
      await task();
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
      try {
        applyResult(await options.saveLayout({ expectedRevision: revision, ...save }));
      } catch {
        applyResult(unknownFailure());
      }
    });

  const runMutation = async <T extends { revision: number }>(
    mutate: (expectedRevision: number) => Promise<BoardMutationResult<T>>,
  ): Promise<BoardMutationResult<T>> => {
    if (conflict) return conflictFailure();
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    await flushNow();
    if (conflict) return conflictFailure();
    let outcome: BoardMutationResult<T> = unknownFailure();
    await enqueue(async () => {
      try {
        outcome = applyResult(await mutate(revision));
      } catch {
        outcome = applyResult(unknownFailure());
      }
    });
    return outcome;
  };

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
    runMutation,
  };
}
