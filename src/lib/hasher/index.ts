import { createHash } from 'crypto';
import { MessageFormat } from '../models/message';

type AnyObject = Record<string, unknown>;

/**
 * Normalize an object by sorting its keys for consistent hashing
 * @param obj The object to normalize
 * @returns A normalized object with sorted keys or array of normalized objects
 */
function normalizeObject(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => normalizeObject(item));
  }

  const result: AnyObject = {};
  // Sort keys to ensure consistent ordering
  const sortedKeys = Object.keys(obj).sort();
  
  for (const key of sortedKeys) {
    const value = obj[key];
    
    if (value instanceof Date) {
      // Convert dates to ISO strings for consistent hashing
      result[key] = value.toISOString();
    } else if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
      // Recursively normalize nested objects
      result[key] = normalizeObject(value as AnyObject);
    } else if (value !== undefined) {
      // Keep other values as-is (except undefined which is not JSON-serializable)
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Generate a SHA-256 hash of a string
 * @param data The data to hash
 * @returns The SHA-256 hash as a hex string
 */
function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a consistent hash for a JSON object
 * @param obj The object to hash
 * @returns A hash string
 */
export function hashJson(obj: unknown): string {
  if (obj === undefined) {
    throw new Error('Cannot hash undefined value');
  }
  
  // Handle primitive types directly
  if (obj === null || typeof obj !== 'object') {
    return sha256(JSON.stringify(obj));
  }
  
  // Normalize and sort object keys for consistent hashing
  const normalized = normalizeObject(obj as AnyObject);
  return sha256(JSON.stringify(normalized));
}

/**
 * Generate a hash for a Protobuf message
 * @param message The Protobuf message to hash
 * @returns A hash string
 */
export function hashProtobuf(message: unknown): string {
  if (!message) {
    throw new Error('Cannot hash null or undefined Protobuf message');
  }
  
  // Check if the message has a serializeBinary method
  if (typeof (message as { serializeBinary?: unknown }).serializeBinary !== 'function') {
    throw new Error('Invalid Protobuf message: missing serializeBinary method');
  }
  
  try {
    // Type assertion since we've verified the method exists
    const binary = (message as { serializeBinary(): Uint8Array }).serializeBinary();
    return createHash('sha256').update(binary).digest('hex');
  } catch (error) {
    throw new Error(`Failed to serialize Protobuf message: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Hash a message using the specified format
 * @param message The message to hash
 * @param format The message format (default: 'json')
 * @returns A hash string
 */
export function hashMessage(
  message: unknown,
  format: MessageFormat = 'json'
): string {
  try {
    switch (format) {
      case 'json':
        return hashJson(message);
      case 'protobuf':
        return hashProtobuf(message);
      default:
        throw new Error(`Unsupported message format: ${format}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to hash message: ${errorMessage}`);
  }
}

export default {
  hashJson,
  hashProtobuf,
  hashMessage,
};
