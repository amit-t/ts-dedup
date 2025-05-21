import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryCache } from '../../lib/cache/memory';

describe('MemoryCache', () => {
  let memoryCache: ReturnType<typeof createMemoryCache>;
  let originalConsoleLog: any;

  beforeEach(() => {
    // Mock console.log for debug output
    originalConsoleLog = console.log;
    console.log = vi.fn();
    
    // Create a new cache instance with a test namespace
    memoryCache = createMemoryCache({
      namespace: 'test',
      ttl: 1, // 1 second for testing
      debug: false
    });
  });

  afterEach(() => {
    // Restore console.log
    console.log = originalConsoleLog;
    // Clear all timers
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('has', () => {
    it('should return false for non-existent key', async () => {
      const result = await memoryCache.has('nonexistent');
      expect(result).toBe(false);
    });

    it('should return true for existing key', async () => {
      await memoryCache.set('existing', 60);
      const result = await memoryCache.has('existing');
      expect(result).toBe(true);
    });

    it('should return false for expired key', async () => {
      await memoryCache.set('expired', 0.1); // 100ms TTL
      
      // Fast-forward time
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const result = await memoryCache.has('expired');
      expect(result).toBe(false);
    });
  });

  describe('set', () => {
    it('should set a key with TTL', async () => {
      await memoryCache.set('test-key', 60);
      const exists = await memoryCache.has('test-key');
      expect(exists).toBe(true);
    });

    it('should override existing key', async () => {
      await memoryCache.set('test-key', 60);
      await memoryCache.set('test-key', 120);
      const exists = await memoryCache.has('test-key');
      expect(exists).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete an existing key', async () => {
      await memoryCache.set('test-key', 60);
      await memoryCache.delete('test-key');
      const exists = await memoryCache.has('test-key');
      expect(exists).toBe(false);
    });

    it('should not throw when deleting non-existent key', async () => {
      await expect(memoryCache.delete('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear all keys', async () => {
      await memoryCache.set('key1', 60);
      await memoryCache.set('key2', 60);
      
      await memoryCache.clear();
      
      const exists1 = await memoryCache.has('key1');
      const exists2 = await memoryCache.has('key2');
      
      expect(exists1).toBe(false);
      expect(exists2).toBe(false);
    });

    it('should clear timers when clearing cache', async () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      
      await memoryCache.set('key1', 60);
      await memoryCache.clear();
      
      expect(setTimeoutSpy).toHaveBeenCalled();
      expect(clearTimeoutSpy).toHaveBeenCalled();
      
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('debug mode', () => {
    it('should log debug messages when debug is enabled', async () => {
      const debugCache = createMemoryCache({ debug: true });
      
      await debugCache.set('test-key', 60);
      await debugCache.has('test-key');
      await debugCache.delete('test-key');
      await debugCache.clear();
      
      expect(console.log).toHaveBeenCalled();
      
      await debugCache.disconnect();
    });
  });
});
