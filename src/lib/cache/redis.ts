import { Redis, type RedisOptions } from 'ioredis';
import { BaseCache, type Cache } from './base';
import { DeduplicatorOptions } from '../models/message';

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
export class RedisCache extends BaseCache implements Cache {
  private readonly client: Redis;
  private readonly prefix: string;
  private readonly defaultTtl: number;
  private isConnected: boolean = false;

  constructor(options: RedisCacheOptions = {}) {
    const deduplicatorOptions: DeduplicatorOptions = {
      ttl: options.ttl,
      namespace: options.prefix ? options.prefix.replace(/:?$/, '') : 'ts-dedup',
      debug: options.debug
    };
    
    super(deduplicatorOptions);
    
    // Handle different ways to initialize Redis client
    if (options.url) {
      this.client = new Redis(options.url);
    } else if (options.options) {
      this.client = new Redis(options.options);
    } else {
      this.client = new Redis();
    }
    
    this.prefix = this.options.namespace.endsWith(':') 
      ? this.options.namespace 
      : `${this.options.namespace}:`;
      
    this.defaultTtl = this.options.ttl;
    this.isConnected = true;
    
    // Set up error handling
    this.client.on('error', (err) => {
      this.debug('Redis client error:', err);
    });
    
    this.client.on('connect', () => {
      this.isConnected = true;
      this.debug('Redis client connected');
    });
    
    this.client.on('end', () => {
      this.isConnected = false;
      this.debug('Redis client disconnected');
    });
  }

  /**
   * Get the full cache key with prefix
   * @param key The cache key
   * @returns Prefixed cache key
   */
  private getKey(key: string): string {
    if (!key) {
      throw new Error('Cache key cannot be empty');
    }
    return `${this.prefix}${key}`.replace(/::+/g, ':');
  }

  /**
   * Check if a key exists in the cache
   * @param key The key to check
   * @returns True if the key exists, false otherwise
   */
  async has(key: string): Promise<boolean> {
    if (!this.isConnected) {
      this.debug('Redis client not connected, assuming key does not exist');
      return false;
    }
    
    try {
      const cacheKey = this.getKey(key);
      const result = await this.client.exists(cacheKey);
      this.debug('Cache has()', { key: cacheKey, exists: result === 1 });
      return result === 1;
    } catch (error) {
      this.debug('Redis has() error:', error);
      return false; // Fail open - if Redis is down, assume no duplicates
    }
  }

  /**
   * Set a key in the cache with TTL
   * @param key The key to set
   * @param ttl Time to live in seconds (defaults to instance default)
   * @throws {Error} If key is empty or TTL is invalid
   */
  async set(key: string, ttl: number = this.defaultTtl): Promise<void> {
    if (!key) {
      throw new Error('Cache key cannot be empty');
    }
    
    if (ttl <= 0) {
      throw new Error('TTL must be greater than 0');
    }
    
    if (!this.isConnected) {
      this.debug('Redis client not connected, skipping set operation');
      return;
    }
    
    const cacheKey = this.getKey(key);
    const ttlSeconds = Math.max(1, Math.floor(ttl)); // Ensure TTL is at least 1 second and an integer
    
    try {
      await this.client.set(
        cacheKey,
        '1',
        'EX',
        ttlSeconds
      );
      this.debug('Cache set', { key: cacheKey, ttl: ttlSeconds });
    } catch (error) {
      this.debug('Redis set() error:', error);
      throw error;
    }
  }

  /**
   * Delete a key from the cache
   * @param key The key to delete
   * @returns Promise that resolves when the operation is complete
   */
  async delete(key: string): Promise<void> {
    if (!key) {
      return;
    }
    
    if (!this.isConnected) {
      this.debug('Redis client not connected, skipping delete operation');
      return;
    }
    
    try {
      const cacheKey = this.getKey(key);
      await this.client.del(cacheKey);
      this.debug('Cache delete', { key: cacheKey });
    } catch (error) {
      this.debug('Redis delete() error:', error);
      // Still resolve even if there's an error to maintain the interface contract
    }
  }
  
  /**
   * Delete a key from the cache and return whether it was deleted
   * @param key The key to delete
   * @returns Promise that resolves to true if the key was deleted, false otherwise
   */
  async deleteWithResult(key: string): Promise<boolean> {
    if (!key || !this.isConnected) {
      return false;
    }
    
    try {
      const cacheKey = this.getKey(key);
      const result = await this.client.del(cacheKey);
      const wasDeleted = result > 0;
      this.debug('Cache deleteWithResult', { key: cacheKey, deleted: wasDeleted });
      return wasDeleted;
    } catch (error) {
      this.debug('Redis deleteWithResult() error:', error);
      return false;
    }
  }

  /**
   * Clear all keys with the current prefix
   * @returns Promise that resolves when the operation is complete
   */
  async clear(): Promise<void> {
    if (!this.isConnected) {
      this.debug('Redis client not connected, skipping clear operation');
      return;
    }
    
    try {
      await this.clearWithCount();
    } catch (error) {
      this.debug('Error in clear():', error);
      // Still resolve even if there's an error to maintain the interface contract
    }
  }
  
  /**
   * Clear all keys with the current prefix and return the count of deleted keys
   * @returns Promise that resolves to the number of keys deleted
   */
  async clearWithCount(): Promise<number> {
    if (!this.isConnected) {
      this.debug('Redis client not connected, skipping clear operation');
      return 0;
    }
    
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
            resolve(deletedCount);
          } catch (error) {
            this.debug('Error in clearWithCount() stream end:', error);
            reject(error);
          }
        });

        stream.on('error', (error) => {
          this.debug('Error in clearWithCount() stream:', error);
          reject(error);
        });
      });
    } catch (error) {
      this.debug('Error in clearWithCount():', error);
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   * @returns True if disconnected successfully, false otherwise
   */
  async disconnect(): Promise<boolean> {
    if (!this.isConnected) {
      this.debug('Redis client already disconnected');
      return true;
    }
    
    try {
      await this.client.quit();
      this.isConnected = false;
      this.debug('Successfully disconnected from Redis');
      return true;
    } catch (error) {
      this.debug('Error disconnecting from Redis:', error);
      return false;
    }
  }
  
  /**
   * Check if the Redis client is connected
   * @returns True if connected, false otherwise
   */
  isConnectedToRedis(): boolean {
    return this.isConnected && this.client.status === 'ready';
  }
  
  /**
   * Get the Redis server info
   * @returns Redis server info as a string
   */
  async getServerInfo(): Promise<string> {
    if (!this.isConnected) {
      return 'Redis client not connected';
    }
    
    try {
      return await this.client.info();
    } catch (error) {
      this.debug('Error getting Redis server info:', error);
      return 'Error getting server info';
    }
  }
}

/**
 * Create a new Redis cache instance
 * @param options Redis connection string or RedisOptions
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
