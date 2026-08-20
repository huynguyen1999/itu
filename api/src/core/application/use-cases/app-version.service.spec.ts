import { AppVersionService } from './app-version.service';
import { APP_VERSION_ERRORS, compareNumericVersions, type AppVersionRelease } from '@core/domain/app-version';
import { DomainException } from '@core/domain/exceptions';

const release: AppVersionRelease = {
  latestVersion: '1.10.0',
  minimumSupportedVersion: '1.9.0',
  updateUrl: 'https://example.com/releases',
  releasedAt: '2026-01-01T00:00:00.000Z',
  title: 'iTu 1.10.0',
  releaseNotes: ['Improved stability.'],
};

describe('AppVersionService', () => {
  it('compares numeric dotted versions by component', () => {
    expect(compareNumericVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareNumericVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareNumericVersions('1.9.9', '1.10.0')).toBeLessThan(0);
  });

  it.each([
    ['1.10.0', 'CURRENT'],
    ['2.0.0', 'CURRENT'],
    ['1.9.9', 'OPTIONAL_UPDATE'],
    ['1.9.0', 'OPTIONAL_UPDATE'],
    ['1.8.9', 'REQUIRED_UPDATE'],
  ] as const)('returns %s as %s', (installedVersion, status) => {
    const service = new AppVersionService({ findRelease: () => release });

    expect(service.check({ platform: 'ios', channel: 'stable', version: installedVersion })).toMatchObject({
      status,
      release: { version: '1.10.0', notes: ['Improved stability.'] },
      update: { url: 'https://example.com/releases' },
    });
  });

  it('reports a missing platform policy without depending on HTTP', () => {
    const service = new AppVersionService({ findRelease: () => undefined });

    expect(() => service.check({ platform: 'macos', channel: 'stable', version: '1.0.0' })).toThrow(
      expect.objectContaining<Partial<DomainException>>({
        code: APP_VERSION_ERRORS.policyNotConfigured,
        status: 500,
      }),
    );
  });
});
