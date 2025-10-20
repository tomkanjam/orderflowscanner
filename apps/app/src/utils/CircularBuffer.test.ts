import { describe, test, expect, beforeEach } from 'vitest';
import { CircularBuffer } from './CircularBuffer';

describe('CircularBuffer', () => {
  let buffer: CircularBuffer<number>;

  beforeEach(() => {
    buffer = new CircularBuffer<number>(3);
  });

  describe('constructor', () => {
    test('creates buffer with specified capacity', () => {
      const buffer = new CircularBuffer<number>(5);
      expect(buffer.maxCapacity).toBe(5);
      expect(buffer.length).toBe(0);
      expect(buffer.isEmpty).toBe(true);
      expect(buffer.isFull).toBe(false);
    });

    test('throws error for invalid capacity', () => {
      expect(() => new CircularBuffer<number>(0)).toThrow('CircularBuffer capacity must be at least 1');
      expect(() => new CircularBuffer<number>(-1)).toThrow('CircularBuffer capacity must be at least 1');
    });
  });

  describe('push', () => {
    test('adds items to buffer', () => {
      buffer.push(1);
      expect(buffer.length).toBe(1);
      expect(buffer.isEmpty).toBe(false);

      buffer.push(2);
      expect(buffer.length).toBe(2);

      buffer.push(3);
      expect(buffer.length).toBe(3);
      expect(buffer.isFull).toBe(true);
    });

    test('enforces capacity limit', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4); // Should evict 1

      expect(buffer.length).toBe(3);
      expect(buffer.isFull).toBe(true);
      expect(buffer.getAll()).toEqual([2, 3, 4]);
    });

    test('evicts oldest when full', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4); // Evicts 1
      buffer.push(5); // Evicts 2
      buffer.push(6); // Evicts 3

      expect(buffer.getAll()).toEqual([4, 5, 6]);
    });

    test('throws error for undefined', () => {
      expect(() => buffer.push(undefined as any)).toThrow('Cannot push undefined to CircularBuffer');
    });

    test('handles many items correctly', () => {
      const largeBuffer = new CircularBuffer<number>(1000);
      for (let i = 0; i < 10000; i++) {
        largeBuffer.push(i);
      }

      expect(largeBuffer.length).toBe(1000);
      expect(largeBuffer.isFull).toBe(true);

      const all = largeBuffer.getAll();
      expect(all.length).toBe(1000);
      expect(all[0]).toBe(9000); // Oldest
      expect(all[999]).toBe(9999); // Newest
    });
  });

  describe('getAll', () => {
    test('returns empty array for empty buffer', () => {
      expect(buffer.getAll()).toEqual([]);
    });

    test('maintains insertion order', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.getAll()).toEqual([1, 2, 3]);
    });

    test('returns correct order after eviction', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);

      expect(buffer.getAll()).toEqual([3, 4, 5]);
    });

    test('returns new array instance', () => {
      buffer.push(1);
      buffer.push(2);

      const arr1 = buffer.getAll();
      const arr2 = buffer.getAll();

      expect(arr1).toEqual(arr2);
      expect(arr1).not.toBe(arr2); // Different instances
    });
  });

  describe('getRecent', () => {
    test('returns empty array for empty buffer', () => {
      expect(buffer.getRecent(5)).toEqual([]);
    });

    test('returns recent items in order', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.getRecent(2)).toEqual([2, 3]);
    });

    test('handles request larger than buffer size', () => {
      buffer.push(1);
      buffer.push(2);

      expect(buffer.getRecent(5)).toEqual([1, 2]);
    });

    test('returns correct items after eviction', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4);
      buffer.push(5);

      expect(buffer.getRecent(2)).toEqual([4, 5]);
      expect(buffer.getRecent(3)).toEqual([3, 4, 5]);
    });
  });

  describe('clear', () => {
    test('removes all items', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      buffer.clear();

      expect(buffer.length).toBe(0);
      expect(buffer.isEmpty).toBe(true);
      expect(buffer.isFull).toBe(false);
      expect(buffer.getAll()).toEqual([]);
    });

    test('allows pushing after clear', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.clear();
      buffer.push(3);
      buffer.push(4);

      expect(buffer.getAll()).toEqual([3, 4]);
      expect(buffer.length).toBe(2);
    });
  });

  describe('peek methods', () => {
    test('peekOldest returns undefined for empty buffer', () => {
      expect(buffer.peekOldest()).toBeUndefined();
    });

    test('peekNewest returns undefined for empty buffer', () => {
      expect(buffer.peekNewest()).toBeUndefined();
    });

    test('peekOldest returns correct item', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.peekOldest()).toBe(1);

      buffer.push(4); // Evicts 1
      expect(buffer.peekOldest()).toBe(2);
    });

    test('peekNewest returns correct item', () => {
      buffer.push(1);
      expect(buffer.peekNewest()).toBe(1);

      buffer.push(2);
      expect(buffer.peekNewest()).toBe(2);

      buffer.push(3);
      expect(buffer.peekNewest()).toBe(3);
    });

    test('peek methods do not modify buffer', () => {
      buffer.push(1);
      buffer.push(2);

      const oldest = buffer.peekOldest();
      const newest = buffer.peekNewest();

      expect(oldest).toBe(1);
      expect(newest).toBe(2);
      expect(buffer.getAll()).toEqual([1, 2]);
      expect(buffer.length).toBe(2);
    });
  });

  describe('status getters', () => {
    test('reports correct length', () => {
      expect(buffer.length).toBe(0);

      buffer.push(1);
      expect(buffer.length).toBe(1);

      buffer.push(2);
      expect(buffer.length).toBe(2);

      buffer.push(3);
      expect(buffer.length).toBe(3);

      buffer.push(4);
      expect(buffer.length).toBe(3); // Still 3 due to capacity
    });

    test('reports correct isEmpty status', () => {
      expect(buffer.isEmpty).toBe(true);

      buffer.push(1);
      expect(buffer.isEmpty).toBe(false);

      buffer.clear();
      expect(buffer.isEmpty).toBe(true);
    });

    test('reports correct isFull status', () => {
      expect(buffer.isFull).toBe(false);

      buffer.push(1);
      expect(buffer.isFull).toBe(false);

      buffer.push(2);
      expect(buffer.isFull).toBe(false);

      buffer.push(3);
      expect(buffer.isFull).toBe(true);

      buffer.push(4);
      expect(buffer.isFull).toBe(true);

      buffer.clear();
      expect(buffer.isFull).toBe(false);
    });
  });

  describe('toArray', () => {
    test('is alias for getAll', () => {
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);

      expect(buffer.toArray()).toEqual(buffer.getAll());
    });
  });

  describe('edge cases', () => {
    test('handles single item capacity', () => {
      const singleBuffer = new CircularBuffer<number>(1);

      singleBuffer.push(1);
      expect(singleBuffer.getAll()).toEqual([1]);

      singleBuffer.push(2);
      expect(singleBuffer.getAll()).toEqual([2]);

      singleBuffer.push(3);
      expect(singleBuffer.getAll()).toEqual([3]);
    });

    test('handles different data types', () => {
      const stringBuffer = new CircularBuffer<string>(3);
      stringBuffer.push('a');
      stringBuffer.push('b');
      stringBuffer.push('c');
      stringBuffer.push('d');

      expect(stringBuffer.getAll()).toEqual(['b', 'c', 'd']);

      const objectBuffer = new CircularBuffer<{id: number}>(2);
      objectBuffer.push({id: 1});
      objectBuffer.push({id: 2});
      objectBuffer.push({id: 3});

      expect(objectBuffer.getAll()).toEqual([{id: 2}, {id: 3}]);
    });

    test('handles rapid push/clear cycles', () => {
      for (let cycle = 0; cycle < 10; cycle++) {
        for (let i = 0; i < 5; i++) {
          buffer.push(i);
        }
        buffer.clear();
      }

      expect(buffer.isEmpty).toBe(true);
      expect(buffer.length).toBe(0);

      buffer.push(100);
      expect(buffer.getAll()).toEqual([100]);
    });
  });

  describe('memory efficiency', () => {
    test('does not grow beyond capacity', () => {
      const hugeBuffer = new CircularBuffer<number>(100);

      // Push way more items than capacity
      for (let i = 0; i < 100000; i++) {
        hugeBuffer.push(i);
      }

      expect(hugeBuffer.length).toBe(100);
      expect(hugeBuffer.getAll().length).toBe(100);

      // Verify correct items are retained
      const all = hugeBuffer.getAll();
      expect(all[0]).toBe(99900); // Oldest
      expect(all[99]).toBe(99999); // Newest
    });
  });
});