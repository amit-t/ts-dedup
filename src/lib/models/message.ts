/**
 * Supported message formats for deduplication
 */
export type MessageFormat = 'json' | 'protobuf';

/**
 * Represents a message that can be deduplicated
 */
export interface Message<T = unknown> {
  /**
   * The message payload
   */
  payload: T;
  
  /**
   * The format of the message (default: 'json')
   */
  format?: MessageFormat;
  
  /**
   * Optional key to use for deduplication (default: auto-generated from payload)
   */
  deduplicationKey?: string;
}

/**
 * Options for the deduplicator
 */
export interface DeduplicatorOptions {
  /**
   * Time-to-live in seconds for deduplication records (default: 300)
   */
  ttl?: number;
  
  /**
   * Namespace to use for cache keys (default: 'ts-dedup')
   */
  namespace?: string;
  
  /**
   * Whether to enable debug logging (default: false)
   */
  debug?: boolean;
}
