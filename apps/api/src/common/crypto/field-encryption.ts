import * as crypto from 'crypto';

// Field-level encryption for highly sensitive columns (currently: Member.nin).
// AES-256-GCM ciphertext, base64-encoded as iv(12) || authTag(16) || ciphertext.
// A separate deterministic HMAC (hashForLookup) backs uniqueness checks so the
// plaintext never needs to be decrypted (or indexed) just to detect a duplicate.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function loadHexKey(envVar: string, minBytes = 32): Buffer {
  const value = process.env[envVar];
  if (!value) {
    throw new Error(`${envVar} is not configured.`);
  }
  const key = Buffer.from(value, 'hex');
  if (key.length < minBytes) {
    throw new Error(`${envVar} must decode to at least ${minBytes} bytes of hex.`);
  }
  return key;
}

function getEncryptionKey(): Buffer {
  return loadHexKey('NIN_ENCRYPTION_KEY').subarray(0, 32);
}

function getHashSecret(): Buffer {
  return loadHexKey('NIN_HASH_SECRET');
}

export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptField(payload: string): string {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

// Deterministic (same input -> same output) so it can back a unique DB index
// for duplicate detection, without ever storing or indexing the plaintext.
export function hashForLookup(value: string): string {
  return crypto.createHmac('sha256', getHashSecret()).update(value).digest('hex');
}
