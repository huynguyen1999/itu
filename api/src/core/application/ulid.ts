import { randomBytes } from 'node:crypto';

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;
const MAX_TIME = 0xffffffffffff;

export function createUlid(date = new Date()): string {
  const time = date.getTime();
  if (!Number.isSafeInteger(time) || time < 0 || time > MAX_TIME) {
    throw new Error('ULID timestamp is out of range');
  }

  let remaining = time;
  const timeChars = Array<string>(TIME_LENGTH);
  for (let index = TIME_LENGTH - 1; index >= 0; index -= 1) {
    timeChars[index] = ENCODING[remaining % 32];
    remaining = Math.floor(remaining / 32);
  }

  const bytes = randomBytes(10);
  let value = 0;
  let bits = 0;
  let random = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      random += ENCODING[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }

  return timeChars.join('') + random.slice(0, RANDOM_LENGTH);
}
