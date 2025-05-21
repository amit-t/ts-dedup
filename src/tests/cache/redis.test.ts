import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRedisCache } from '../../lib/cache/redis';
import Redis from 'ioredis';

// Mock ioredis
vi.mock('ioredis', () => {
  const RedisMock = vi.fn().mockImplementation(() => ({
    exists: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    scanStream: vi.fn(),
    pipeline: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
    quit: vi.fn().mockResolvedValue('OK'),
  }));

  return {
    __esModule: true,
    default: RedisMock,
  };
});

describe('RedisCache', () => {
  let redisCache: ReturnType<typeof createRedisCache>;
  let mockRedis: any;

  beforeEach(() => {
    // Create a new instance of the mock Redis client
    mockRedis = new Redis();
    // Reset all mocks before each test
    vi.clearAllMocks();
    
    // Create a new cache instance with a test namespace
    redisCache = createRedisCache(
      { host: 'localhost', port: 6379 },
      { prefix: 'test:', ttl: 60, debug: false }
    );
  });

  afterEach(async () => {
    // Clean up after each test
    if (redisCache) {
      await redisCache.disconnect();
    }
  });

  describe('has', () => {
    it('should return false for non-existent key', async () => {
      mockRedis.exists.mockResolvedValue(0);
      const result = await redisCache.has('nonexistent');
      expect(result).toBe(false);
      expect(mockRedis.exists).toHaveBeenCalledWith('test:nonexistent');
    });

    it('should return true for existing key', async () => {
      mockRedis.exists.mockResolvedValue(1);
      const result = await redisCache.has('existing');
      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('test:existing');
    });
  });

  describe('set', () => {
    it('should set a key with TTL', async () => {
      await redisCache.set('test-key', 60);
      expect(mockRedis.set).toHaveBeenCalledWith('test:test-key', '1', 'EX', 60);
    });

    it('should use default TTL if not provided', async () => {
      await redisCache.set('test-key');
      expect(mockRedis.set).toHaveBeenCalledWith('test:test-key', '1', 'EX', 60);
    });
  });

  describe('delete', () => {
    it('should delete an existing key', async () => {
      await redisCache.delete('test-key');
      expect(mockRedis.del).toHaveBeenCalledWith('test:test-key');
    });
  });

  describe('clear', () => {
    it('should clear all keys with prefix', async () => {
      // Mock the scan stream
      const mockStream = {
        on: vi.fn((event, callback) => {
          if (event === 'data') {
            // Simulate finding some keys
            process.nextTick(() => callback(['test:key1', 'test:key2']));
            // Simulate end of stream
            process.nextTick(() => {
              const endCallback = mockStream.on.mock.calls.find(
                ([e]) => e === 'end'
              )?.[1];
              if (endCallback) endCallback();
            });
          }
          return mockStream;
        }),
      };

      mockRedis.scanStream.mockReturnValue(mockStream);
      mockRedis.pipeline.mockReturnValue({
        del: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([null, null]),
      });

      await redisCache.clear();

      expect(mockRedis.scanStream).toHaveBeenCalledWith({
        match: 'test:*',
        count: 100,
      });
      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    it('should handle empty key set', async () => {
      const mockStream = {
        on: vi.fn((event, callback) => {
          if (event === 'end') {
            process.nextTick(callback);
          }
          return mockStream;
        }),
      };

      mockRedis.scanStream.mockReturnValue(mockStream);
      await redisCache.clear();
      expect(mockRedis.pipeline().del).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should close the Redis connection', async () => {
      await redisCache.disconnect();
      expect(mockRedis.quit).toHaveBeenCalled();
    });

    it('should not throw if disconnect is called multiple times', async () => {
      await redisCache.disconnect();
      await expect(redisCache.disconnect()).resolves.not.toThrow();
    });
  });
});
