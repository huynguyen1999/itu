import { resolveMediaStoragePath } from './local-media-storage';

describe('resolveMediaStoragePath', () => {
  it('keeps Journal attachment paths inside the configured root', () => {
    expect(resolveMediaStoragePath('/tmp/media', 'journal/u1/file.webp')).toBe('/tmp/media/journal/u1/file.webp');
    expect(resolveMediaStoragePath('/tmp/media', '../other/file.webp')).toBeNull();
    expect(resolveMediaStoragePath('/tmp/media', '/etc/passwd')).toBeNull();
  });
});
