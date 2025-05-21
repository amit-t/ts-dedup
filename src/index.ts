// Core exports
export * from './lib/deduplicator';
export * from './lib/cache/memory';
export * from './lib/cache/redis';
export * from './lib/hasher';
export * from './lib/models/message';

// Re-export common types
export { Cache } from './lib/cache/base';
export { DeduplicatorOptions, Message, MessageFormat } from './lib/models/message';

// Default export for better ESM/CommonJS interop
import { Deduplicator } from './lib/deduplicator';
export default Deduplicator;
