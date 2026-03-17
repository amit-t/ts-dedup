import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRedisCache, type RedisCache } from '../../lib/cache/redis';
import type { Redis as RedisClient, ScanStream } from 'ioredis';

// Simple mock implementation for Redis client
const mockPipeline = {
  del: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([[null, 1]]),
};

const mockRedis = {
  status: 'ready' as const,
  exists: vi.fn().mockResolvedValue(0),
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn().mockResolvedValue(null),
  del: vi.fn().mockResolvedValue(0),
  scanStream: vi.fn().mockReturnValue({
    on: vi.fn((event: string, callback: (keys: string[]) => void) => {
      if (event === 'data') {
        process.nextTick(() => callback([]));
      } else if (event === 'end') {
        process.nextTick(callback);
      }
      return { on: vi.fn() };
    }),
  }),
  pipeline: () => mockPipeline,
  quit: vi.fn().mockResolvedValue('OK'),
  info: vi.fn().mockResolvedValue(''),
  connect: vi.fn().mockResolvedValue('OK'),
  duplicate: vi.fn().mockImplementation(() => mockRedis as unknown as RedisClient),
  disconnect: vi.fn(),
  keys: vi.fn().mockResolvedValue([]),
};

// Mock ioredis
vi.mock('ioredis', () => ({
  __esModule: true,
  default: vi.fn(() => mockRedis),
}));

describe('RedisCache', () => {
  let redisCache: RedisCache;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Create a new RedisCache instance for each test
    redisCache = createRedisCache({
      host: 'localhost',
      port: 6379,
      keyPrefix: 'test:',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await (redisCache as any).disconnect();
  });

  describe('has', () => {
    it('should return true if key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);
      const result = await (redisCache as any).has('test-key');
      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('test:test-key');
    });

    it('should return false if key does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);
      const result = await (redisCache as any).has('nonexistent');
      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      mockRedis.exists.mockRejectedValue(new Error('Redis error'));
      const result = await (redisCache as any).has('error-key');
      expect(result).toBe(false);
    });
  });

  describe('set', () => {
    it('should set a key with the namespace prefix', async () => {
      await (redisCache as any).set('test-key', 'test-value');
      expect(mockRedis.set).toHaveBeenCalledWith('test:test-key', 'test-value', 'EX', 3600);
    });

    it('should handle JSON values correctly', async () => {
      const testValue = { foo: 'bar' };
      await (redisCache as any).set('json-key', JSON.stringify(testValue));
      expect(mockRedis.set).toHaveBeenCalledWith(
        'test:json-key',
        JSON.stringify(testValue),
        'EX',
        3600
      );
    });

    it('should use custom TTL if provided', async () => {
      await (redisCache as any).set('test-key', 'test-value', 60);
      expect(mockRedis.set).toHaveBeenCalledWith('test:test-key', 'test-value', 'EX', 60);
    });
  });

  describe('delete', () => {
    it('should delete a key with the namespace prefix', async () => {
      await (redisCache as any).delete('test-key');
      expect(mockRedis.del).toHaveBeenCalledWith('test:test-key');
    });
  });

  describe('clear', () => {
    it('should clear all keys with the namespace prefix', async () => {
      const mockStream = {
        on: vi.fn((event: string, callback: (keys: string[]) => void) => {
          if (event === 'data') {
            process.nextTick(() => callback(['test:key1', 'test:key2']));
            process.nextTick(() => {
              // Simulate end of stream
              const endCallback = mockStream.on.mock.calls.find(
                ([e]: [string]) => e === 'end'
              )?.[1];
              if (endCallback) endCallback();
            });
          }
          return { on: vi.fn() };
        }),
      } as unknown as ScanStream;
      mockRedis.scanStream = vi.fn().mockReturnValue(mockStream);

      // Mock the pipeline
      const mockPipeline = {
        del: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 1],
          [null, 1],
        ]),
      };
      (mockRedis.pipeline as jest.Mock).mockReturnValue(mockPipeline);

      await (redisCache as any).clear();

      expect(mockRedis.scanStream).toHaveBeenCalledWith({
        match: 'test:*',
        count: 100,
      });
      expect(mockPipeline.del).toHaveBeenCalledWith(['test:key1', 'test:key2']);
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should handle empty key set', async () => {
      const mockStream = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'end') process.nextTick(callback);
          return { on: vi.fn() };
        }),
      } as unknown as ScanStream;

      mockRedis.scanStream = vi.fn().mockReturnValue(mockStream);

      await redisCache.clear();

      expect(vi.mocked(mockRedis.scanStream)).toHaveBeenCalled();
    });
  });

  describe('deleteWithResult', () => {
    it('should return true when key is deleted', async () => {
      vi.mocked(mockRedis.del).mockResolvedValue(1);
      mockRedis.del.mockResolvedValue(1);
      const result = await (redisCache as any).deleteWithResult('test-key');
      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('test:test-key');
    });

    it('should return false when key does not exist', async () => {
      mockRedis.del.mockResolvedValue(0);
      const result = await (redisCache as any).deleteWithResult('nonexistent');
      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis error'));
      const result = await (redisCache as any).deleteWithResult('test-key');
      expect(result).toBe(false);
    });
  });

  describe('clearWithCount', () => {
    it('should return the number of deleted keys', async () => {
      // Mock the scan stream
      const mockStream = {
        on: vi.fn((event: string, callback: (keys: string[]) => void) => {
          if (event === 'data') {
            process.nextTick(() => callback(['test:key1', 'test:key2']));
            process.nextTick(() => {
              // Simulate end of stream
              const endCallback = mockStream.on.mock.calls.find(
                ([e]: [string]) => e === 'end'
              )?.[1];
              if (endCallback) endCallback();
            });
          }
          return { on: vi.fn() };
        }),
      } as unknown as ScanStream;
      mockRedis.scanStream = vi.fn().mockReturnValue(mockStream);

      // Mock the pipeline
      const mockPipeline = {
        del: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 1],
          [null, 1],
        ]),
      };
      (mockRedis.pipeline as jest.Mock).mockReturnValue(mockPipeline);

      const deletedCount = await redisCache.clearWithCount();
      expect(deletedCount).toBe(2); // 2 keys in each batch
    });

    it('should handle empty key set', async () => {
      const mockStream = {
        on: vi.fn((event: string, callback: () => void) => {
          if (event === 'end') process.nextTick(callback);
          return mockStream;
        }),
      };

      vi.mocked(mockRedis.scanStream).mockReturnValue(mockStream as unknown as ScanStream);

      const deletedCount = await redisCache.clearWithCount();
      expect(deletedCount).toBe(0);
    });
  });

  describe('isConnectedToRedis', () => {
    it('should check connection status', () => {
      mockRedis.status = 'ready';
      expect(redisCache.isConnectedToRedis()).toBe(true);
    });

    it('should return false when not connected', () => {
      Object.defineProperty(mockRedis, 'status', { value: 'end', writable: true });
      expect(redisCache.isConnectedToRedis()).toBe(false);
    });
  });

  describe('getServerInfo', () => {
    it('should get server info', async () => {
      const mockInfo = '# Server\nredis_version:6.2.6';
      mockRedis.info.mockResolvedValue(mockInfo);
      const info = await redisCache.getServerInfo();
      expect(info).toBe(mockInfo);
      expect(mockRedis.info).toHaveBeenCalled();
    });

    it('should return error message when not connected', async () => {
      mockRedis.info.mockRejectedValue(new Error('Not connected'));
      const info = await redisCache.getServerInfo();
      expect(info).toBe('Error getting server info');
    });
  });

  describe('createRedisCache', () => {
    it('should create instance with connection string', () => {
      const cache = createRedisCache('redis://localhost:6379');
      expect(cache).toBeDefined();
    });

    it('should create instance with RedisOptions', () => {
      const cache = createRedisCache({ host: 'localhost', port: 6379 });
      expect(cache).toBeDefined();
    });

    it('should apply custom options', () => {
      const cache = createRedisCache(
        { host: 'localhost' },
        { prefix: 'custom:', ttl: 120, debug: true }
      );
      expect(cache).toBeDefined();
    });
  });
});
