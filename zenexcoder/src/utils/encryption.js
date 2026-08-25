import { webcrypto } from 'node:crypto';

const subtle = webcrypto.subtle;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITERATIONS = 210000;

function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function fromBase64(value) {
  return Buffer.from(value, 'base64');
}

export function randomBase64(bytes = 32) {
  return toBase64(webcrypto.getRandomValues(new Uint8Array(bytes)));
}

export async function deriveAesGcmKey(secret, saltBase64) {
  const material = await subtle.importKey(
    'raw',
    encoder.encode(String(secret || '')),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: fromBase64(saltBase64),
      iterations: ITERATIONS,
      hash: 'SHA-256'
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptJson(value, secret, saltBase64 = randomBase64(16)) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesGcmKey(secret, saltBase64);
  const plaintext = encoder.encode(JSON.stringify(value ?? null));
  const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    version: 1,
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: saltBase64,
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
    createdAt: Date.now()
  };
}

export async function decryptJson(envelope, secret) {
  if (!envelope?.data || !envelope?.iv || !envelope?.salt) {
    throw new Error('Invalid encrypted vault envelope.');
  }
  const key = await deriveAesGcmKey(secret, envelope.salt);
  const plaintext = await subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv) },
    key,
    fromBase64(envelope.data)
  );
  return JSON.parse(decoder.decode(plaintext));
}
