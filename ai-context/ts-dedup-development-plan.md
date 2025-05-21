# `ts-dedup` – Node.js TypeScript Deduplication Library Plan

## Objective

Build a lightweight, pluggable TypeScript library for Node.js that offers time-bound deduplication of messages from streams/queues using consistent hashing of JSON or Protobuf messages. Prevents reprocessing of duplicates within a configurable TTL window.

---

## Phase 0: Bootstrap Setup

### Files & Structure
```
ts-dedup/
├── src/lib/
│   └── (code modules)
├── tests/
├── .gitignore
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE
```

### Steps
- Initialize Git repository
- Setup `pnpm` or `npm` with `package.json`
- Configure `tsconfig.json`
- Add testing with `jest` or `vitest`
- Set up linting and formatting (`eslint`, `prettier`)

---

## Phase 1: Core Library Modules

### Structure
```
src/lib/
├── index.ts
├── cache/
│   ├── base.ts
│   ├── memory.ts
│   └── redis.ts
├── hasher/
│   ├── index.ts
│   └── protobuf.ts
├── models/
│   └── message.ts
└── deduplicator.ts
```

### Core Modules
- `cache/`: Time-based in-memory and Redis cache backends
- `hasher/`: Canonical JSON + Protobuf hash generation using SHA256
- `models/`: Type-safe message structures
- `deduplicator.ts`: Central logic to check/store hashes

---

## Phase 2: Hashing Logic

### Features
- Canonical JSON hashing (`JSON.stringify(obj, Object.keys(obj).sort())`)
- Protobuf hashing using `message.serializeBinary()` and `crypto.createHash('sha256')`

### Exposed API
```ts
function hashMessage(message: any, format: 'json' | 'protobuf'): string;
```

---

## Phase 3: Deduplication Interface

### API Design
```ts
class Deduplicator {
  constructor(ttlSeconds: number, cacheBackend: Cache);

  isDuplicate(message: any, format: 'json' | 'protobuf'): Promise<boolean>;
}
```

- Abstracts hashing and caching
- Accepts pluggable cache
- Returns a `Promise<boolean>`

---

## Phase 4: Cache Backend Support

### Interface
```ts
interface Cache {
  get(key: string): Promise<boolean>;
  set(key: string, ttl: number): Promise<void>;
}
```

### Implementations
- `MemoryCache`: Uses `Map` with TTL
- `RedisCache`: Uses `ioredis` or `redis` package

---

## Phase 5: Testing Suite

### Tools
- `vitest` or `jest`
- `sinon` for time mocking
- `protobufjs` for testing protobuf hashing

### Test Coverage
```
tests/
├── deduplicator.test.ts
├── cache.test.ts
└── hasher.test.ts
```

---

## Phase 6: Packaging & Publishing

### Steps
- Finalize `package.json` with metadata
- Add usage examples and API docs to `README.md`
- Add CLI tool (optional) under `bin/`
- Publish to npm

---

## Sample Usage

```ts
import { Deduplicator } from './lib/deduplicator';
import { RedisCache } from './lib/cache/redis';

const cache = new RedisCache('redis://localhost:6379');
const dedup = new Deduplicator(60, cache);

if (!(await dedup.isDuplicate(message, 'json'))) {
  process(message);
}
```

---

## TODO for Windsurf Agent
- Generate code stubs for all modules
- Add `.env.example` for Redis config
- Auto-generate docs with `typedoc`
- CLI tool to test message hashes manually

---

## Optional Extensions
- Sliding window metrics (e.g., Prometheus exporter)
- Message schema validation with `zod` or `io-ts`
- Kafka/MQ-specific integrations