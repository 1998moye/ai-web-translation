/** 控制同时进行的翻译请求数量；排队任务按先进先出获得空位。 */
export interface ConcurrencyLimiter {
  readonly limit: number;
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createConcurrencyLimiter(limit: number): ConcurrencyLimiter {
  const max = Math.max(1, Math.floor(limit));
  let active = 0;
  const waiting: (() => void)[] = [];

  const acquire = async (): Promise<void> => {
    if (active < max) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => waiting.push(resolve));
    // 空位在 release 时直接转交给等待者，不再重复递增。
  };

  const release = (): void => {
    const next = waiting.shift();
    if (next) {
      next();
      return;
    }
    active = Math.max(0, active - 1);
  };

  return {
    limit: max,
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
}
