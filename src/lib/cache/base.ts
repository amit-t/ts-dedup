import { DeduplicatorOptions } from '../models/message';

/**
 * Base interface for cache implementations
 */
export interface Cache {
  /**
   * Check if a key exists in the cache
   * @param key The key to check
   * @returns Promise that resolves to true if the key exists, false otherwise
   */
  has(key: string): Promise<boolean>;
  
  /**
   * Set a key in the cache with a TTL
   * @param key The key to set
   * @param ttl Time-to-live in seconds
   * @returns Promise that resolves when the operation is complete
   */
  set(key: string, ttl: number): Promise<void>;
  
  /**
   * Delete a key from the cache
   * @param key The key to delete
   * @returns Promise that resolves when the operation is complete
   */
  delete(key: string): Promise<void>;
  
  /**
   * Clear all keys from the cache (optional operation)
   * @returns Promise that resolves when the operation is complete
   */
  clear?(): Promise<void>;
}

/**
 * Base class for cache implementations with common functionality
 */
export abstract class BaseCache implements Cache {
  protected readonly options: Required<DeduplicatorOptions>;
  
  constructor(options: DeduplicatorOptions = {}) {
    this.options = {
      ttl: options.ttl ?? 300, // 5 minutes default
      namespace: options.namespace ?? 'ts-dedup',
      debug: options.debug ?? false,
    };
  }
  
  /**
   * Generate a namespaced cache key
   * @param key The base key
   * @returns The namespaced key
   */
  protected getNamespacedKey(key: string): string {
    return `${this.options.namespace}:${key}`;
  }
  
  /**
   * Log a debug message if debug is enabled
   * @param message The message to log
   * @param args Additional arguments to log
   */
  protected debug(message: string, ...args: unknown[]): void {
    if (this.options.debug) {
      console.debug(`[ts-dedup:cache] ${message}`, ...args);
    }
  }
  
  abstract has(key: string): Promise<boolean>;
  abstract set(key: string, ttl: number): Promise<void>;
  abstract delete(key: string): Promise<void>;
}
