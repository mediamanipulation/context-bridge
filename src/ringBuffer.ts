export class RingBuffer<T> {
  private buffer: (T | undefined)[];
  private head: number = 0;
  private count: number = 0;

  constructor(private readonly capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) { this.count++; }
  }

  /** Return all items in chronological order (oldest first). */
  toArray(): T[] {
    if (this.count === 0) { return []; }
    const result: T[] = [];
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      result.push(this.buffer[idx] as T);
    }
    return result;
  }

  /** Return items from the last `ms` milliseconds. Assumes items have a `timestamp` field. */
  since(ms: number, now: number = Date.now()): T[] {
    const cutoff = now - ms;
    return this.toArray().filter((item: any) => item.timestamp >= cutoff);
  }

  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.count = 0;
  }

  get size(): number { return this.count; }
  get maxSize(): number { return this.capacity; }
}
