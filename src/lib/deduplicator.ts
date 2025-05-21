import type { Cache } from './cache/base';
import { createMemoryCache } from './cache/memory';
import { createRedisCache } from './cache/redis';
import { hashMessage } from './hasher';
import { type Message, type MessageFormat, type DeduplicatorOptions } from './models/message';

/**
 * Options for creating a Redis-based deduplicator
 */
export interface RedisDeduplicatorOptions extends DeduplicatorOptions {
  /**
   * Redis connection string or options
   */
  redis?: string | Parameters<typeof createRedisCache>[0];
}

/**
 * Deduplicator class that handles message deduplication
 */
export class Deduplicator<T = unknown> {
  private readonly cache: Cache;
  private readonly options: Required<DeduplicatorOptions>;

  /**
   * Create a new Deduplicator instance
   * @param options Deduplicator options
   */
  constructor(options: DeduplicatorOptions & { cache?: Cache } = {}) {
    this.cache = options.cache || createMemoryCache();
    this.options = {
      ttl: options.ttl ?? 300, // 5 minutes default TTL
      namespace: options.namespace ?? 'ts-dedup',
      debug: options.debug ?? false,
      ...options,
    };

    this.debug('Deduplicator initialized', {
      type: this.cache.constructor.name,
      ttl: this.options.ttl,
      namespace: this.options.namespace,
    });
  }

  /**
   * Check if a message is a duplicate
   * @param message The message to check
   * @returns Promise that resolves to true if the message is a duplicate
   */
  async isDuplicate(message: Message<T> | T): Promise<boolean> {
    const normalized = this.normalizeMessage(message);
    const key = this.getCacheKey(normalized);

    try {
      const exists = await this.cache.has(key);

      if (exists) {
        this.debug('Duplicate message found', { key });
        return true;
      }

      // Add to cache if not a duplicate
      await this.cache.set(key, this.options.ttl);
      this.debug('New message added to cache', { key, ttl: this.options.ttl });

      return false;
    } catch (error) {
      this.debug('Error checking for duplicate', { error: error instanceof Error ? error.message : String(error), key });
      // Fail open - if there's an error, assume it's not a duplicate
      // This prevents false positives in case of cache failures
      return false;
    }
  }

  /**
   * Process a message only if it's not a duplicate
   * @param message The message to process
   * @param processor The processor function to call if not a duplicate
   * @returns Promise that resolves to the result of the processor function or undefined if duplicate
   */
  async processIfNotDuplicate<R>(
    message: Message<T> | T,
    processor: (message: T) => Promise<R> | R
  ): Promise<{ result: R; isDuplicate: boolean } | { result: undefined; isDuplicate: true }> {
    const isDuplicate = await this.isDuplicate(message);

    if (isDuplicate) {
      return { result: undefined, isDuplicate: true };
    }

    const normalized = this.normalizeMessage(message);
    const result = await processor(normalized.payload);

    return { result, isDuplicate: false };
  }

  /**
   * Remove a message from the cache
   * @param message The message to remove
   */
  async removeFromCache(message: Message<T> | T): Promise<void> {
    const normalized = this.normalizeMessage(message);
    const key = this.getCacheKey(normalized);

    try {
      await this.cache.delete(key);
      this.debug('Message removed from cache', { key });
    } catch (error) {
      this.debug('Error removing from cache', { error: error instanceof Error ? error.message : String(error), key });
      throw error;
    }
  }

  /**
   * Clear all cached messages
   */
  async clearCache(): Promise<void> {
    try {
      // Check if cache has clear method before calling it
      if (typeof this.cache.clear === 'function') {
        await this.cache.clear();
        this.debug('Cache cleared');
      } else {
        this.debug('Cache does not support clear operation');
      }
    } catch (error) {
      this.debug('Error clearing cache', { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Get the cache key for a message
   * @param message The normalized message
   * @returns The cache key
   */
  private getCacheKey(message: Message<T>): string {
    if (message.deduplicationKey) {
      return `${this.options.namespace}:${message.deduplicationKey}`;
    }

    const hash = hashMessage(message.payload, message.format);
    return `${this.options.namespace}:${hash}`;
  }

  /**
   * Normalize a message to ensure it has the correct shape
   * @param message The message to normalize
   * @returns Normalized message
   */
  private normalizeMessage(message: Message<T> | T): Message<T> {
    // If it's already a Message, return it as is
    if (message && typeof message === 'object' && 'payload' in message) {
      return message as Message<T>;
    }

    // Otherwise, wrap the payload in a Message
    return {
      payload: message as T,
      format: 'json', // Default format
    };
  }

  /**
   * Log a debug message if debug is enabled
   * @param message The message to log
   * @param data Additional data to log
   */
  private debug(message: string, data: Record<string, unknown> = {}): void {
    if (this.options.debug) {
      // Using console.log instead of process.stdout.write for better compatibility
      // @ts-ignore - console.log is available in Node.js
      console.log(`[ts-dedup] ${message}`, JSON.stringify(data, null, 2));
    }
  }

  /**
   * Create a new Redis-based deduplicator
   * @param options Deduplicator options with Redis configuration
   * @returns A new Deduplicator instance with Redis cache
   */
  static createRedisDeduplicator<T = unknown>(
    options: RedisDeduplicatorOptions & { ttl?: number; namespace?: string } = {}
  ): Deduplicator<T> {
    const { redis, ttl, namespace, ...deduplicatorOptions } = options;
    const cache = createRedisCache(redis);
    return new Deduplicator<T>({
      ...deduplicatorOptions,
      cache,
      ttl: ttl ?? options.ttl,
      namespace: namespace ?? options.namespace,
    });
  }
}

/**
 * Create a new Deduplicator instance with a memory cache
 * @param options Deduplicator options
 * @returns A new Deduplicator instance with memory cache
 */
/**
 * Create a new memory-based deduplicator
 * @param options Deduplicator options
 * @returns A new Deduplicator instance with in-memory cache
 */
export function createMemoryDeduplicator<T = unknown>(
  options: DeduplicatorOptions = {}
): Deduplicator<T> {
  const cache = createMemoryCache();
  return new Deduplicator<T>({
    ...options,
    cache,
  });
}

/**
 * Options for creating a Redis-based deduplicator
 */
export interface RedisDeduplicatorOptions extends DeduplicatorOptions {
  /**
   * Redis connection string or options
   */
  redis?: string | Parameters<typeof createRedisCache>[0];
}

export default Deduplicator;
