import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

export function encryptAesGcm(value: string, secret: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}

export function decryptAesGcm(value: string, secret: string): string {
  const [ivText, tagText, encryptedText] = value.split('.');
  const iv = Buffer.from(ivText ?? '', 'base64url');
  const tag = Buffer.from(tagText ?? '', 'base64url');
  const encrypted = Buffer.from(encryptedText ?? '', 'base64url');
  const decipher = createDecipheriv(ALGORITHM, key(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function key(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}
