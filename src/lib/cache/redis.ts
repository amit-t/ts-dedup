import { Redis, type RedisOptions } from 'ioredis';
import type { Cache } from './base';

export interface RedisCacheOptions {
  /**
   * Redis connection string or options
   */
  url?: string;
  /**
   * Redis client options
   */
  options?: RedisOptions;
  /**
   * Key prefix for all cache keys
   */
  prefix?: string;
  /**
   * Default TTL in seconds
   */
  ttl?: number;
  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Redis implementation of the Cache interface
 */
export class RedisCache implements Cache {
  private readonly client: Redis;
  private readonly prefix: string;
  private readonly defaultTtl: number;
  private readonly debugEnabled: boolean;

  constructor(options: RedisCacheOptions = {}) {
    // Handle different ways to initialize Redis client
    if (options.url) {
      this.client = new Redis(options.url);
    } else if (options.options) {
      this.client = new Redis(options.options);
    } else {
      this.client = new Redis();
    }
    
    this.prefix = options.prefix || 'ts-dedup:';
    this.defaultTtl = options.ttl ?? 300; // 5 minutes default TTL
    this.debugEnabled = options.debug ?? false;
  }

  /**
   * Get the full cache key with prefix
   * @param key The cache key
   * @returns Prefixed cache key
   */
  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Check if a key exists in the cache
   * @param key The key to check
   * @returns True if the key exists, false otherwise
   */
  async has(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(this.getKey(key));
      return result === 1;
    } catch (error) {
      this.debug('Redis has() error:', error);
      return false; // Fail open - if Redis is down, assume no duplicates
    }
  }

  /**
   * Set a key in the cache with TTL
   * @param key The key to set
   * @param ttl Time to live in seconds
   */
  async set(key: string, ttl: number = this.defaultTtl): Promise<void> {
    try {
      await this.client.set(
        this.getKey(key),
        '1',
        'EX',
        Math.max(1, Math.floor(ttl)) // Ensure TTL is at least 1 second and an integer
      );
      this.debug('Cache set', { key, ttl });
    } catch (error) {
      this.debug('Redis set() error:', error);
      throw error;
    }
  }

  /**
   * Delete a key from the cache
   * @param key The key to delete
   */
  async delete(key: string): Promise<void> {
    try {
      await this.client.del(this.getKey(key));
      this.debug('Cache deleted', { key });
    } catch (error) {
      this.debug('Redis delete() error:', error);
      throw error;
    }
  }

  /**
   * Clear all keys with the current prefix
   */
  async clear(): Promise<void> {
    try {
      const stream = this.client.scanStream({
        match: `${this.prefix}*`,
        count: 100,
      });

      const pipeline = this.client.pipeline();
      let keysToDelete: string[] = [];
      let deletedCount = 0;

      return new Promise((resolve, reject) => {
        stream.on('data', (keys: string[]) => {
          if (keys.length === 0) return;
          
          // Queue keys for deletion
          keysToDelete.push(...keys);
          
          // Process in batches to avoid blocking Redis
          if (keysToDelete.length >= 100) {
            pipeline.del(...keysToDelete);
            deletedCount += keysToDelete.length;
            keysToDelete = [];
          }
        });

        stream.on('end', async () => {
          try {
            // Delete any remaining keys
            if (keysToDelete.length > 0) {
              pipeline.del(...keysToDelete);
              deletedCount += keysToDelete.length;
            }

            if (deletedCount > 0) {
              await pipeline.exec();
            }
            
            this.debug('Cache cleared', { count: deletedCount });
            resolve();
          } catch (error) {
            this.debug('Error in clear() stream end:', error);
            reject(error);
          }
        });

        stream.on('error', (error) => {
          this.debug('Error in clear() stream:', error);
          reject(error);
        });
      });
    } catch (error) {
      this.debug('Error in clear():', error);
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
    } catch (error) {
      this.debug('Error disconnecting from Redis:', error);
      throw error;
    }
  }

  /**
   * Log debug messages if debug is enabled
   */
  /**
   * Log debug messages if debug is enabled
   */
  private debug(message: string, data?: any): void {
    if (this.debugEnabled) {
      console.log(`[RedisCache] ${message}`, data ? JSON.stringify(data, null, 2) : '');
    }
  }
}

/**
 * Create a new Redis cache instance
 * @param options Redis client options or connection string
 * @param cacheOptions Cache options
 * @returns A new RedisCache instance
 */
/**
 * Create a new Redis cache instance
 * @param options Redis connection options (URL string or RedisOptions)
 * @param cacheOptions Additional cache options
 * @returns A new RedisCache instance
 */
export function createRedisCache(
  options: string | RedisOptions = {},
  cacheOptions: Omit<RedisCacheOptions, 'url' | 'options'> = {}
): RedisCache {
  return new RedisCache({
    ...cacheOptions,
    ...(typeof options === 'string' ? { url: options } : { options })
  });
}

export default RedisCache;
