import { BaseCache } from './base';
import type { DeduplicatorOptions } from '../models/message';

interface CacheEntry {
  expires: number;
  timeout: NodeJS.Timeout;
}

/**
 * In-memory cache implementation using a Map
 */
export class MemoryCache extends BaseCache {
  private readonly cache: Map<string, CacheEntry> = new Map();
  
  constructor(options: DeduplicatorOptions = {}) {
    super(options);
  }
  
  /**
   * Check if a key exists in the cache and is not expired
   * @param key The key to check
   * @returns Promise that resolves to true if the key exists and is not expired
   */
  async has(key: string): Promise<boolean> {
    const namespacedKey = this.getNamespacedKey(key);
    const entry = this.cache.get(namespacedKey);
    
    if (!entry) {
      return false;
    }
    
    if (entry.expires < Date.now()) {
      await this.delete(key);
      return false;
    }
    
    return true;
  }
  
  /**
   * Set a key in the cache with a TTL
   * @param key The key to set
   * @param ttl Time-to-live in seconds
   * @returns Promise that resolves when the operation is complete
   */
  async set(key: string, ttl: number): Promise<void> {
    const namespacedKey = this.getNamespacedKey(key);
    const expires = Date.now() + ttl * 1000;
    
    // Clear any existing timeout
    await this.delete(key);
    
    // Set a timeout to automatically remove the entry when it expires
    const timeout = setTimeout(() => {
      this.cache.delete(namespacedKey);
    }, ttl * 1000);
    
    // Store the entry
    this.cache.set(namespacedKey, { expires, timeout });
  }
  
  /**
   * Delete a key from the cache
   * @param key The key to delete
   * @returns Promise that resolves when the operation is complete
   */
  async delete(key: string): Promise<void> {
    const namespacedKey = this.getNamespacedKey(key);
    const entry = this.cache.get(namespacedKey);
    
    if (entry) {
      clearTimeout(entry.timeout);
      this.cache.delete(namespacedKey);
    }
  }
  
  /**
   * Clear all entries from the cache
   * @returns Promise that resolves when the operation is complete
   */
  async clear(): Promise<void> {
    // Clear all timeouts
    for (const entry of this.cache.values()) {
      clearTimeout(entry.timeout);
    }
    
    this.cache.clear();
  }
}

/**
 * Create a new in-memory cache instance
 * @param options Cache options
 * @returns A new MemoryCache instance
 */
export const createMemoryCache = (options: DeduplicatorOptions = {}): MemoryCache => {
  return new MemoryCache(options);
};
