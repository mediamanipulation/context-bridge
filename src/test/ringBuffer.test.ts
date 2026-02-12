import * as assert from 'assert';
import { RingBuffer } from '../ringBuffer';

suite('RingBuffer', () => {

  test('starts empty', () => {
    const buf = new RingBuffer<number>(5);
    assert.strictEqual(buf.size, 0);
    assert.strictEqual(buf.maxSize, 5);
    assert.deepStrictEqual(buf.toArray(), []);
  });

  test('push and toArray returns items in order', () => {
    const buf = new RingBuffer<number>(5);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    assert.strictEqual(buf.size, 3);
    assert.deepStrictEqual(buf.toArray(), [1, 2, 3]);
  });

  test('wraps around when capacity exceeded', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4); // overwrites 1
    assert.strictEqual(buf.size, 3);
    assert.deepStrictEqual(buf.toArray(), [2, 3, 4]);
  });

  test('wraps around multiple times', () => {
    const buf = new RingBuffer<number>(2);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4);
    buf.push(5);
    assert.strictEqual(buf.size, 2);
    assert.deepStrictEqual(buf.toArray(), [4, 5]);
  });

  test('clear resets state', () => {
    const buf = new RingBuffer<number>(5);
    buf.push(1);
    buf.push(2);
    buf.clear();
    assert.strictEqual(buf.size, 0);
    assert.deepStrictEqual(buf.toArray(), []);
  });

  test('since() filters by timestamp', () => {
    const now = 10000;
    const buf = new RingBuffer<{ timestamp: number; value: string }>(10);
    buf.push({ timestamp: 5000, value: 'old' });
    buf.push({ timestamp: 8000, value: 'recent' });
    buf.push({ timestamp: 9500, value: 'very-recent' });

    const last3s = buf.since(3000, now);
    assert.strictEqual(last3s.length, 2);
    assert.strictEqual(last3s[0].value, 'recent');
    assert.strictEqual(last3s[1].value, 'very-recent');
  });

  test('since() returns empty when nothing in window', () => {
    const now = 10000;
    const buf = new RingBuffer<{ timestamp: number }>(10);
    buf.push({ timestamp: 1000 });
    buf.push({ timestamp: 2000 });

    const result = buf.since(1000, now);
    assert.strictEqual(result.length, 0);
  });

  test('since() returns all when window is large', () => {
    const now = 10000;
    const buf = new RingBuffer<{ timestamp: number }>(10);
    buf.push({ timestamp: 5000 });
    buf.push({ timestamp: 8000 });

    const result = buf.since(60000, now);
    assert.strictEqual(result.length, 2);
  });

  test('capacity of 1', () => {
    const buf = new RingBuffer<number>(1);
    buf.push(1);
    assert.deepStrictEqual(buf.toArray(), [1]);
    buf.push(2);
    assert.deepStrictEqual(buf.toArray(), [2]);
    assert.strictEqual(buf.size, 1);
  });

  test('exact capacity fill', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    assert.strictEqual(buf.size, 3);
    assert.deepStrictEqual(buf.toArray(), [1, 2, 3]);
  });

  test('preserves chronological order after many wraps', () => {
    const buf = new RingBuffer<number>(3);
    for (let i = 1; i <= 10; i++) {
      buf.push(i);
    }
    assert.deepStrictEqual(buf.toArray(), [8, 9, 10]);
  });
});
