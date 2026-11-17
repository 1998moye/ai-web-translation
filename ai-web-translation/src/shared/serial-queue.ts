/** 串行队列：保证同一模块的读改写不互相覆盖。 */
export interface SerialQueue {
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createSerialQueue(): SerialQueue {
  let tail: Promise<unknown> = Promise.resolve();

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const next = tail.then(task, task);
      tail = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}
