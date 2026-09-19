import { decryptField, encryptField, hashForLookup } from './field-encryption';

describe('field-encryption', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NIN_ENCRYPTION_KEY: 'a'.repeat(64),
      NIN_HASH_SECRET: 'b'.repeat(64),
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('round-trips plaintext through encrypt/decrypt', () => {
    const ciphertext = encryptField('12345678901');
    expect(ciphertext).not.toContain('12345678901');
    expect(decryptField(ciphertext)).toBe('12345678901');
  });

  it('produces different ciphertext for the same plaintext each time (random IV)', () => {
    const a = encryptField('12345678901');
    const b = encryptField('12345678901');
    expect(a).not.toEqual(b);
    expect(decryptField(a)).toBe(decryptField(b));
  });

  it('hashForLookup is deterministic for the same input', () => {
    expect(hashForLookup('12345678901')).toEqual(hashForLookup('12345678901'));
  });

  it('hashForLookup differs for different inputs', () => {
    expect(hashForLookup('12345678901')).not.toEqual(hashForLookup('10987654321'));
  });

  it('hashForLookup is not reversible to the plaintext (not simply encoded)', () => {
    const hash = hashForLookup('12345678901');
    expect(hash).not.toContain('12345678901');
    expect(hash).toHaveLength(64); // hex-encoded SHA-256
  });

  it('throws a clear error when the encryption key is missing', () => {
    delete process.env.NIN_ENCRYPTION_KEY;
    expect(() => encryptField('12345678901')).toThrow('NIN_ENCRYPTION_KEY is not configured.');
  });

  it('tampered ciphertext fails to decrypt (GCM authentication)', () => {
    const ciphertext = encryptField('12345678901');
    const tampered = ciphertext.slice(0, -4) + 'AAAA';
    expect(() => decryptField(tampered)).toThrow();
  });
});
