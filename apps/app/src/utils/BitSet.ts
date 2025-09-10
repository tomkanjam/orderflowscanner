/**
 * BitSet - Thread-safe bit operations using SharedArrayBuffer
 * 
 * Provides efficient bit manipulation for tracking symbol updates
 * across main thread and workers using atomic operations.
 */
export class BitSet {
  private readonly buffer: Uint32Array;
  private readonly maxBits: number;
  
  constructor(buffer: Uint32Array, maxBits: number) {
    this.buffer = buffer;
    this.maxBits = maxBits;
  }
  
  /**
   * Set a bit at the given index
   */
  set(index: number): void {
    if (index < 0 || index >= this.maxBits) return;
    const arrayIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    Atomics.or(this.buffer, arrayIndex, 1 << bitIndex);
  }
  
  /**
   * Clear a bit at the given index
   */
  clear(index: number): void {
    if (index < 0 || index >= this.maxBits) return;
    const arrayIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    Atomics.and(this.buffer, arrayIndex, ~(1 << bitIndex));
  }
  
  /**
   * Check if a bit is set at the given index
   */
  isSet(index: number): boolean {
    if (index < 0 || index >= this.maxBits) return false;
    const arrayIndex = Math.floor(index / 32);
    const bitIndex = index % 32;
    return (Atomics.load(this.buffer, arrayIndex) & (1 << bitIndex)) !== 0;
  }
  
  /**
   * Clear all bits in the set
   */
  clearAll(): void {
    for (let i = 0; i < this.buffer.length; i++) {
      Atomics.store(this.buffer, i, 0);
    }
  }
  
  /**
   * Get all indices where bits are set
   */
  getSetIndices(): number[] {
    const indices: number[] = [];
    for (let i = 0; i < this.maxBits; i++) {
      if (this.isSet(i)) {
        indices.push(i);
      }
    }
    return indices;
  }
  
  /**
   * Count the number of set bits
   */
  count(): number {
    let count = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const value = Atomics.load(this.buffer, i);
      // Brian Kernighan's algorithm for counting set bits
      let n = value;
      while (n) {
        n &= n - 1;
        count++;
      }
    }
    return count;
  }
  
  /**
   * Get size of the BitSet in bits
   */
  size(): number {
    return this.maxBits;
  }
}