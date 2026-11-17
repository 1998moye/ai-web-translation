/** 可逐条消费的异步队列：用于把并发完成的事件按到达顺序交给消费者。 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly buffer: T[] = [];
  private waiter: (() => void) | null = null;
  private ended = false;

  push(value: T): void {
    if (this.ended) return;
    this.buffer.push(value);
    this.wake();
  }

  end(): void {
    this.ended = true;
    this.wake();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      const next = this.buffer.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (this.ended) return;
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
  }

  private wake(): void {
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.();
  }
}
