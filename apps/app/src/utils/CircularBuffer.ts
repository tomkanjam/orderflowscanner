/**
 * CircularBuffer - Fixed-size buffer with O(1) operations
 *
 * A circular buffer (ring buffer) that automatically evicts the oldest
 * items when capacity is reached. Provides constant-time push operations
 * and maintains insertion order for retrieval.
 *
 * @template T The type of elements stored in the buffer
 */
export class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private capacity: number;
  private size: number;
  private head: number; // Write position (next insertion point)
  private tail: number; // Read position (oldest item)

  /**
   * Creates a new circular buffer with fixed capacity
   * @param capacity Maximum number of items the buffer can hold
   * @throws Error if capacity is less than 1
   */
  constructor(capacity: number) {
    if (capacity < 1) {
      throw new Error('CircularBuffer capacity must be at least 1');
    }

    this.capacity = capacity;
    this.buffer = new Array(capacity);
    this.size = 0;
    this.head = 0;
    this.tail = 0;
  }

  /**
   * Adds an item to the buffer
   * If buffer is full, the oldest item is automatically evicted
   * @param item The item to add
   */
  push(item: T): void {
    if (item === undefined) {
      throw new Error('Cannot push undefined to CircularBuffer');
    }

    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;

    if (this.size < this.capacity) {
      this.size++;
    } else {
      // Buffer is full, move tail forward (evicting oldest)
      this.tail = (this.tail + 1) % this.capacity;
    }
  }

  /**
   * Retrieves all items in the buffer in insertion order (oldest to newest)
   * @returns Array of items in the buffer
   */
  getAll(): T[] {
    const result: T[] = [];
    let current = this.tail;

    for (let i = 0; i < this.size; i++) {
      const item = this.buffer[current];
      if (item !== undefined) {
        result.push(item);
      }
      current = (current + 1) % this.capacity;
    }

    return result;
  }

  /**
   * Retrieves the most recent N items (newest items)
   * @param count Number of recent items to retrieve
   * @returns Array of recent items, may be less than count if buffer has fewer items
   */
  getRecent(count: number): T[] {
    const actualCount = Math.min(count, this.size);
    const result: T[] = [];

    // Start from head and go backwards
    let current = (this.head - 1 + this.capacity) % this.capacity;

    for (let i = 0; i < actualCount; i++) {
      const item = this.buffer[current];
      if (item !== undefined) {
        result.unshift(item); // Add to beginning to maintain order
      }
      current = (current - 1 + this.capacity) % this.capacity;
    }

    return result;
  }

  /**
   * Clears all items from the buffer
   */
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.size = 0;
    this.head = 0;
    this.tail = 0;
  }

  /**
   * Gets the current number of items in the buffer
   */
  get length(): number {
    return this.size;
  }

  /**
   * Checks if the buffer is at full capacity
   */
  get isFull(): boolean {
    return this.size === this.capacity;
  }

  /**
   * Checks if the buffer is empty
   */
  get isEmpty(): boolean {
    return this.size === 0;
  }

  /**
   * Gets the maximum capacity of the buffer
   */
  get maxCapacity(): number {
    return this.capacity;
  }

  /**
   * Gets the oldest item without removing it
   * @returns The oldest item or undefined if buffer is empty
   */
  peekOldest(): T | undefined {
    if (this.size === 0) {
      return undefined;
    }
    return this.buffer[this.tail];
  }

  /**
   * Gets the newest item without removing it
   * @returns The newest item or undefined if buffer is empty
   */
  peekNewest(): T | undefined {
    if (this.size === 0) {
      return undefined;
    }
    const newestIndex = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[newestIndex];
  }

  /**
   * Converts the buffer to an array for iteration
   * Alias for getAll() for array-like interface
   */
  toArray(): T[] {
    return this.getAll();
  }
}