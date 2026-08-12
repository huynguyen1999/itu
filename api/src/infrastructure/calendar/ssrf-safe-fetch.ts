import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { BadRequestException, GatewayTimeoutException } from '@nestjs/common';
import { fetchWithTimeout } from '@infrastructure/http/outbound-http';

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;

export async function fetchCalendarText(input: string): Promise<{ text: string; etag?: string; lastModified?: string }> {
  let current = validateCalendarUrl(input);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicHost(current.hostname);
    let response: Response;
    try {
      response = await fetchWithTimeout(current, { redirect: 'manual', headers: { accept: 'text/calendar,text/plain;q=0.9' } });
    } catch {
      throw new GatewayTimeoutException('Calendar source could not be reached');
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirect === MAX_REDIRECTS) throw new BadRequestException('Calendar source redirect is invalid');
      current = validateCalendarUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new BadRequestException('Calendar source returned an error');
    const length = Number(response.headers.get('content-length'));
    if (Number.isFinite(length) && length > MAX_BYTES) throw new BadRequestException('Calendar source is too large');
    if (!response.body) throw new BadRequestException('Calendar source was empty');

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > MAX_BYTES) throw new BadRequestException('Calendar source is too large');
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return {
      text: new TextDecoder().decode(bytes),
      etag: response.headers.get('etag') ?? undefined,
      lastModified: response.headers.get('last-modified') ?? undefined,
    };
  }
  throw new BadRequestException('Calendar source redirect is invalid');
}

export function validateCalendarUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new BadRequestException('Calendar URL is invalid'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new BadRequestException('Calendar URL is invalid');
  }
  return url;
}

async function assertPublicHost(hostname: string): Promise<void> {
  let addresses: string[];
  try {
    addresses = isIP(hostname) ? [hostname] : (await lookup(hostname, { all: true, verbatim: true })).map((item) => item.address);
  } catch {
    throw new BadRequestException('Calendar URL host could not be resolved');
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new BadRequestException('Calendar URL points to a private host');
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7));
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb');
  }
  const octets = address.split('.').map(Number);
  const [first, second, third] = octets;
  return first === 0 || first === 10 || first === 127 || first === 100 && second >= 64 && second <= 127 || first === 169 && second === 254 || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 0 && third === 0 || first === 192 && second === 0 && third === 2 || first === 192 && second === 168 || first === 198 && (second === 18 || second === 19 || second === 51 && third === 100) || first === 203 && second === 0 && third === 113 || first >= 224;
}
