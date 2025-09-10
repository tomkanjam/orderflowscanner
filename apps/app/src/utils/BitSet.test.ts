import { describe, it, expect, beforeEach } from 'vitest';
import { BitSet } from './BitSet';

describe('BitSet', () => {
  let buffer: Uint32Array;
  let bitSet: BitSet;
  const maxBits = 200;
  const bufferSize = Math.ceil(maxBits / 32); // 7 uint32s for 200 bits
  
  beforeEach(() => {
    // Create a SharedArrayBuffer in test environment
    if (typeof SharedArrayBuffer !== 'undefined') {
      const sharedBuffer = new SharedArrayBuffer(bufferSize * Uint32Array.BYTES_PER_ELEMENT);
      buffer = new Uint32Array(sharedBuffer);
    } else {
      // Fallback for environments without SharedArrayBuffer
      buffer = new Uint32Array(bufferSize);
    }
    bitSet = new BitSet(buffer, maxBits);
  });
  
  describe('set and isSet', () => {
    it('should set and check individual bits', () => {
      expect(bitSet.isSet(0)).toBe(false);
      bitSet.set(0);
      expect(bitSet.isSet(0)).toBe(true);
      
      expect(bitSet.isSet(31)).toBe(false);
      bitSet.set(31);
      expect(bitSet.isSet(31)).toBe(true);
      
      expect(bitSet.isSet(32)).toBe(false);
      bitSet.set(32);
      expect(bitSet.isSet(32)).toBe(true);
      
      expect(bitSet.isSet(199)).toBe(false);
      bitSet.set(199);
      expect(bitSet.isSet(199)).toBe(true);
    });
    
    it('should handle boundary cases', () => {
      // Test bit 0 (first bit)
      bitSet.set(0);
      expect(bitSet.isSet(0)).toBe(true);
      expect(bitSet.isSet(1)).toBe(false);
      
      // Test last valid bit
      bitSet.set(199);
      expect(bitSet.isSet(199)).toBe(true);
      expect(bitSet.isSet(198)).toBe(false);
      
      // Test out of bounds (should be ignored)
      bitSet.set(200);
      expect(bitSet.isSet(200)).toBe(false);
      
      bitSet.set(-1);
      expect(bitSet.isSet(-1)).toBe(false);
      
      bitSet.set(1000);
      expect(bitSet.isSet(1000)).toBe(false);
    });
    
    it('should work across uint32 boundaries', () => {
      // Set bits in different uint32 elements
      bitSet.set(30); // In first uint32
      bitSet.set(31); // Last bit of first uint32
      bitSet.set(32); // First bit of second uint32
      bitSet.set(33); // In second uint32
      
      expect(bitSet.isSet(30)).toBe(true);
      expect(bitSet.isSet(31)).toBe(true);
      expect(bitSet.isSet(32)).toBe(true);
      expect(bitSet.isSet(33)).toBe(true);
      expect(bitSet.isSet(29)).toBe(false);
      expect(bitSet.isSet(34)).toBe(false);
    });
  });
  
  describe('clear', () => {
    it('should clear individual bits', () => {
      bitSet.set(5);
      bitSet.set(10);
      bitSet.set(150);
      
      expect(bitSet.isSet(5)).toBe(true);
      expect(bitSet.isSet(10)).toBe(true);
      expect(bitSet.isSet(150)).toBe(true);
      
      bitSet.clear(10);
      expect(bitSet.isSet(5)).toBe(true);
      expect(bitSet.isSet(10)).toBe(false);
      expect(bitSet.isSet(150)).toBe(true);
      
      bitSet.clear(5);
      bitSet.clear(150);
      expect(bitSet.isSet(5)).toBe(false);
      expect(bitSet.isSet(10)).toBe(false);
      expect(bitSet.isSet(150)).toBe(false);
    });
    
    it('should handle clearing already clear bits', () => {
      expect(bitSet.isSet(50)).toBe(false);
      bitSet.clear(50);
      expect(bitSet.isSet(50)).toBe(false);
    });
    
    it('should handle out of bounds clear', () => {
      // Should not throw
      bitSet.clear(-1);
      bitSet.clear(200);
      bitSet.clear(1000);
      expect(bitSet.count()).toBe(0);
    });
  });
  
  describe('clearAll', () => {
    it('should clear all bits', () => {
      // Set various bits
      bitSet.set(0);
      bitSet.set(31);
      bitSet.set(32);
      bitSet.set(100);
      bitSet.set(199);
      
      expect(bitSet.count()).toBe(5);
      
      bitSet.clearAll();
      
      expect(bitSet.count()).toBe(0);
      expect(bitSet.isSet(0)).toBe(false);
      expect(bitSet.isSet(31)).toBe(false);
      expect(bitSet.isSet(32)).toBe(false);
      expect(bitSet.isSet(100)).toBe(false);
      expect(bitSet.isSet(199)).toBe(false);
    });
    
    it('should work on already empty set', () => {
      expect(bitSet.count()).toBe(0);
      bitSet.clearAll();
      expect(bitSet.count()).toBe(0);
    });
  });
  
  describe('getSetIndices', () => {
    it('should return empty array when no bits are set', () => {
      expect(bitSet.getSetIndices()).toEqual([]);
    });
    
    it('should return indices of set bits in order', () => {
      bitSet.set(5);
      bitSet.set(10);
      bitSet.set(150);
      bitSet.set(0);
      bitSet.set(199);
      
      const indices = bitSet.getSetIndices();
      expect(indices).toEqual([0, 5, 10, 150, 199]);
    });
    
    it('should handle dense bit patterns', () => {
      for (let i = 10; i < 20; i++) {
        bitSet.set(i);
      }
      
      const indices = bitSet.getSetIndices();
      expect(indices).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
    });
  });
  
  describe('count', () => {
    it('should count zero bits in empty set', () => {
      expect(bitSet.count()).toBe(0);
    });
    
    it('should count set bits correctly', () => {
      bitSet.set(0);
      expect(bitSet.count()).toBe(1);
      
      bitSet.set(31);
      expect(bitSet.count()).toBe(2);
      
      bitSet.set(32);
      expect(bitSet.count()).toBe(3);
      
      bitSet.set(100);
      bitSet.set(150);
      bitSet.set(199);
      expect(bitSet.count()).toBe(6);
      
      bitSet.clear(100);
      expect(bitSet.count()).toBe(5);
    });
    
    it('should handle all bits set in a uint32', () => {
      // Set all bits in first uint32 (0-31)
      for (let i = 0; i < 32; i++) {
        bitSet.set(i);
      }
      expect(bitSet.count()).toBe(32);
    });
  });
  
  describe('size', () => {
    it('should return the maximum number of bits', () => {
      expect(bitSet.size()).toBe(200);
    });
  });
  
  describe('thread safety simulation', () => {
    it('should handle concurrent-like operations', () => {
      // Simulate multiple threads setting different bits
      const operations = [
        () => bitSet.set(10),
        () => bitSet.set(20),
        () => bitSet.set(30),
        () => bitSet.clear(20),
        () => bitSet.set(40),
        () => bitSet.set(50),
      ];
      
      // Execute all operations
      operations.forEach(op => op());
      
      // Verify final state
      expect(bitSet.isSet(10)).toBe(true);
      expect(bitSet.isSet(20)).toBe(false);
      expect(bitSet.isSet(30)).toBe(true);
      expect(bitSet.isSet(40)).toBe(true);
      expect(bitSet.isSet(50)).toBe(true);
      expect(bitSet.count()).toBe(4);
    });
  });
  
  describe('edge cases', () => {
    it('should handle maximum capacity', () => {
      // Set all valid bits
      for (let i = 0; i < 200; i++) {
        bitSet.set(i);
      }
      expect(bitSet.count()).toBe(200);
      expect(bitSet.getSetIndices().length).toBe(200);
      
      // Clear all
      bitSet.clearAll();
      expect(bitSet.count()).toBe(0);
      expect(bitSet.getSetIndices().length).toBe(0);
    });
    
    it('should handle sparse patterns efficiently', () => {
      // Set every 10th bit
      for (let i = 0; i < 200; i += 10) {
        bitSet.set(i);
      }
      
      const indices = bitSet.getSetIndices();
      expect(indices.length).toBe(20);
      expect(indices[0]).toBe(0);
      expect(indices[1]).toBe(10);
      expect(indices[19]).toBe(190);
    });
  });
});