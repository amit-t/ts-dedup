# ts-dedup

[![npm version](https://img.shields.io/npm/v/ts-dedup.svg)](https://www.npmjs.com/package/ts-dedup)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/yourusername/ts-dedup/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/ts-dedup/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/yourusername/ts-dedup/graph/badge.svg?token=YOUR-TOKEN)](https://codecov.io/gh/yourusername/ts-dedup)

A lightweight, pluggable TypeScript library for Node.js that offers time-bound deduplication of messages from streams/queues using consistent hashing of JSON or Protobuf messages. Prevents reprocessing of duplicates within a configurable TTL window.

## Features

- 🚀 **Lightweight** - Small footprint with minimal dependencies
- ⚡ **Fast** - Efficient hashing and caching mechanisms
- 🔌 **Pluggable** - Use built-in memory cache or bring your own (e.g., Redis)
- 📦 **TypeScript First** - Full TypeScript support with comprehensive type definitions
- 🛡 **Secure** - Uses SHA-256 for secure hashing
- 🧪 **Well-Tested** - Comprehensive test suite with high code coverage
- 🔄 **Flexible** - Works with JSON and Protobuf message formats

## Installation

```bash
# Using npm
npm install ts-dedup

# Using yarn
yarn add ts-dedup

# Using pnpm
pnpm add ts-dedup
```

## Quick Start

### Basic Usage with Memory Cache

```typescript
import { createMemoryDeduplicator } from 'ts-dedup';

// Create a deduplicator with 5-minute TTL
const deduplicator = createMemoryDeduplicator({ ttl: 300 });

// Process a message only if it's not a duplicate
const message = { id: '123', content: 'Hello, world!' };

async function processMessage() {
  const isDuplicate = await deduplicator.isDuplicate(message);
  
  if (!isDuplicate) {
    console.log('Processing new message:', message);
    // Your processing logic here
  } else {
    console.log('Duplicate message, skipping:', message.id);
  }
}

processMessage();
```

### Using with Redis

```typescript
import { createRedisDeduplicator } from 'ts-dedup';

// Create a Redis-based deduplicator
const deduplicator = createRedisDeduplicator(
  'redis://localhost:6379', // Redis connection string
  { 
    ttl: 300, // 5 minutes
    namespace: 'my-app', // Optional namespace for cache keys
    debug: true // Enable debug logging
  }
);

// Process messages with automatic deduplication
const messages = [
  { id: '1', content: 'First' },
  { id: '2', content: 'Second' },
  { id: '1', content: 'First' } // Duplicate
];

async function processMessages() {
  for (const message of messages) {
    const { isDuplicate } = await deduplicator.processIfNotDuplicate(
      message,
      async (msg) => {
        console.log('Processing:', msg);
        return { success: true, processedAt: new Date() };
      }
    );
    
    if (isDuplicate) {
      console.log(`Skipped duplicate: ${message.id}`);
    }
  }
}

processMessages();
```

## API Reference

### `Deduplicator<T>`

Main class for deduplicating messages.

#### Constructor

```typescript
new Deduplicator(cache: 'memory' | 'redis' | Cache, options?: DeduplicatorOptions)
```

- `cache`: Either a string indicating the built-in cache type ('memory' or 'redis') or a custom cache implementation
- `options`: Configuration options (see below)

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | `300` | Time-to-live in seconds for deduplication records |
| `namespace` | `string` | `'ts-dedup'` | Namespace for cache keys |
| `debug` | `boolean` | `false` | Enable debug logging |

#### Methods

##### `isDuplicate(message: Message<T> | T): Promise<boolean>`

Check if a message is a duplicate.

- `message`: The message to check (can be a raw value or a `Message` object)
- Returns: `Promise<boolean>` - `true` if the message is a duplicate, `false` otherwise

##### `processIfNotDuplicate<R>(
  message: Message<T> | T,
  processor: (message: T) => Promise<R> | R
): Promise<{ result: R; isDuplicate: false } | { result: undefined; isDuplicate: true }>`

Process a message only if it's not a duplicate.

- `message`: The message to process
- `processor`: A function that processes the message if it's not a duplicate
- Returns: An object with the result and a flag indicating if the message was a duplicate

##### `addToCache(message: Message<T> | T): Promise<void>`

Manually add a message to the deduplication cache.

- `message`: The message to add

##### `removeFromCache(message: Message<T> | T): Promise<void>`

Manually remove a message from the deduplication cache.

- `message`: The message to remove

##### `clearCache(): Promise<void>`

Clear all entries from the cache.

##### `close(): Promise<void>`

Close any resources used by the deduplicator (e.g., Redis connection).

### Helper Functions

#### `createMemoryDeduplicator<T>(options?: DeduplicatorOptions): Deduplicator<T>`

Create a new `Deduplicator` instance with an in-memory cache.

#### `createRedisDeduplicator<T>(
  redisOptions?: RedisOptions | string, 
  options?: DeduplicatorOptions
): Deduplicator<T>`

Create a new `Deduplicator` instance with a Redis cache.

### Hashing Utilities

#### `hashJson(obj: unknown): string`

Generate a consistent hash for a JSON-serializable object.

#### `hashProtobuf(message: unknown): string`

Generate a hash for a Protobuf message.

#### `hashMessage(message: unknown, format: 'json' | 'protobuf' = 'json'): string`

Generate a hash for a message in the specified format.

## Advanced Usage

### Custom Cache Implementation

You can implement your own cache by implementing the `Cache` interface:

```typescript
import { Cache } from 'ts-dedup';

class MyCustomCache implements Cache {
  async has(key: string): Promise<boolean> {
    // Your implementation
    return false;
  }
  
  async set(key: string, ttl: number): Promise<void> {
    // Your implementation
  }
  
  async delete(key: string): Promise<void> {
    // Your implementation
  }
}

// Use with Deduplicator
const deduplicator = new Deduplicator(new MyCustomCache());
```

### Protobuf Support

```typescript
import { Deduplicator } from 'ts-dedup';
import { MyMessage } from './generated/message_pb';

const message = new MyMessage();
message.setId('123');
message.setContent('Hello, Protobuf!');

const deduplicator = new Deduplicator('memory');
const isDuplicate = await deduplicator.isDuplicate({
  payload: message,
  format: 'protobuf'
});
```

## Performance Considerations

- The in-memory cache is suitable for single-process applications with moderate message volumes.
- For distributed systems or high-throughput scenarios, use the Redis backend.
- Be mindful of the TTL setting - longer TTLs will use more memory.
- Use meaningful namespaces to avoid key collisions in shared environments.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Run tests:
   ```bash
   pnpm test
   ```
4. Build the project:
   ```bash
   pnpm build
   ```

## License

MIT © Amit Tiwari
